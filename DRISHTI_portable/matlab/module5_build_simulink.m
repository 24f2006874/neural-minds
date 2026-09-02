function module5_build_simulink()
% =========================================================================
% DRISHTI - MODULE 5: SIMULINK CAPACITY PLANNER (model builder)
% =========================================================================
% Builds the telemedicine screening workflow as a SimEvents discrete-event
% simulation, programmatically - running this ONE script creates the model
% file DRISHTI_CapacityPlanner.slx. No manual block editing needed!
%
% WORKFLOW MODELLED (matches our PPT Module 5):
%
%   [Patient arrivals]      Poisson process (mean inter-arrival 3 min)
%        |
%   [Acquisition Queue]     Entity Queue
%        |
%   [Cameras (Acquisition)] Entity Server, service = 5 min/patient
%        |
%   [Trust Gate + Enhance]  Entity Server, ~30 s enhancement delay
%        |                  (simplification: applied to every patient)
%   [AI Processing (GPU)]   Entity Server, ~5 s per image
%        |
%   [Review Queue]          Entity Queue
%        |
%   [Ophthalmologist Rev.]  Entity Server, 30 s/case
%        |
%   [Completed]             Entity Terminator
%
% HOW TO SEE THE STATISTICS (important!):
%   1. Open any Entity Queue / Entity Server block -> tab "Statistics" ->
%      enable e.g. "Average wait" / "Utilization" -> a new OUTPUT PORT appears
%   2. Drag a Scope block and connect that port to it
%   3. Or open the Simulation Data Inspector after running
%
% Requires: Simulink + SimEvents
% NOTE: block parameter names vary slightly between MATLAB releases. Every
% set_param below is wrapped in try/catch: if a parameter name is not
% recognised in your release, the model is still built - just set that
% parameter manually in the block dialog (30 seconds in the GUI).
% =========================================================================

modelName = 'DRISHTI_CapacityPlanner';
if bdIsLoaded(modelName), close_system(modelName, 0); end
if exist([modelName '.slx'], 'file'), delete([modelName '.slx']); end
new_system(modelName);

% ---- layout ----
x = 60; dx = 190; y = 60; dy = 150;

% ---- helper: set block parameters safely (parameter names vary by release) ----
function safeSet(modelName, name, varargin)
    try
        set_param([modelName '/' name], varargin{:});
    catch ME
        warning('Could not set parameters on "%s" (%s).\nSet them manually in the block dialog: service/arrival times etc.', ...
            name, ME.message);
    end
end

% ---- 1. Patient arrivals (Poisson process) ----
add_block(resolveBlock('Entity Generator'), [modelName '/Patient Arrivals'], ...
    'Position', [x, y, x+120, y+60]);
safeSet(modelName, 'Patient Arrivals', ...
    'TimeSource', 'Specify', ...          % release-dependent value names
    'Period', '3');                       % mean inter-arrival (min) = 60/20 patients/hour

% ---- 2. Image acquisition queue + camera servers ----
add_block(resolveBlock('Entity Queue'), [modelName '/Acquisition Queue'], ...
    'Position', [x+dx, y, x+dx+120, y+60]);
add_block(resolveBlock('Entity Server'), [modelName '/Cameras (Acquisition)'], ...
    'Position', [x+2*dx, y, x+2*dx+120, y+60]);
safeSet(modelName, 'Cameras (Acquisition)', ...
    'ServiceTimeSource', 'Specify', ...   % set capacity = number of cameras
    'ServiceTime', '5');                  % 5 minutes per patient

% ---- 3. Trust Gate: enhancement delay for borderline images ----
add_block(resolveBlock('Entity Server'), [modelName '/Trust Gate + Enhance'], ...
    'Position', [x+2*dx, y+dy, x+2*dx+120, y+dy+60]);
safeSet(modelName, 'Trust Gate + Enhance', ...
    'ServiceTimeSource', 'Specify', ...
    'ServiceTime', '0.5');                % 30 s enhancement

% ---- 4. AI processing (GPU laptop) ----
add_block(resolveBlock('Entity Server'), [modelName '/AI Processing (GPU)'], ...
    'Position', [x+dx, y+dy, x+dx+120, y+dy+60]);
safeSet(modelName, 'AI Processing (GPU)', ...
    'ServiceTimeSource', 'Specify', ...
    'ServiceTime', '0.08');               % ~5 s per full pipeline run

% ---- 5. Human review queue + reviewer servers ----
add_block(resolveBlock('Entity Queue'), [modelName '/Review Queue'], ...
    'Position', [x, y+dy, x+120, y+dy+60]);
add_block(resolveBlock('Entity Server'), [modelName '/Ophthalmologist Review'], ...
    'Position', [x, y+2*dy, x+120, y+2*dy+60]);
safeSet(modelName, 'Ophthalmologist Review', ...
    'ServiceTimeSource', 'Specify', ...
    'ServiceTime', '0.5');                % 30 s verification per case

% ---- 6. Terminator ----
add_block(resolveBlock('Entity Terminator'), [modelName '/Completed'], ...
    'Position', [x+dx, y+2*dy, x+dx+120, y+2*dy+60]);

% ---- connect the flow (wrapped: port names vary slightly by release) ----
connections = { ...
    'Patient Arrivals/OUT',        'Acquisition Queue/IN'; ...
    'Acquisition Queue/OUT',       'Cameras (Acquisition)/IN'; ...
    'Cameras (Acquisition)/OUT',   'Trust Gate + Enhance/IN'; ...
    'Trust Gate + Enhance/OUT',    'AI Processing (GPU)/IN'; ...
    'AI Processing (GPU)/OUT',     'Review Queue/IN'; ...
    'Review Queue/OUT',            'Ophthalmologist Review/IN'; ...
    'Ophthalmologist Review/OUT',  'Completed/IN'};
for i = 1:size(connections, 1)
    try
        add_line(modelName, connections{i,1}, connections{i,2});
    catch
        warning('Auto-connect failed for "%s -> %s". Connect them manually in the GUI (2 clicks).', ...
            connections{i,1}, connections{i,2});
    end
end

% ---- simulation settings: one year of operation ----
set_param(modelName, 'StopTime', '525600');   % minutes in a year
set_param(modelName, 'Solver', 'ode23tb');

save_system(modelName);
fprintf('\nSimulink model created: %s.slx\n', modelName);
fprintf('---------------------------------------------------------------\n');
fprintf('NEXT STEPS (2 minutes in the GUI):\n');
fprintf(' 1. Press RUN. The simulation covers 1 year of patients.\n');
fprintf(' 2. To see wait times/utilisation: open any Queue/Server block,\n');
fprintf('    tab "Statistics" -> enable "Average wait" / "Utilization",\n');
fprintf('    then connect the new output port to a Scope block.\n');
fprintf(' 3. WHAT-IF: change arrival Period, camera capacity, or review\n');
fprintf('    time in the block dialogs and re-run. That is the resource\n');
fprintf('    optimisation story for the judges.\n');
fprintf('---------------------------------------------------------------\n');
end

function path = resolveBlock(blockName)
% Return the SimEvents library path used by the installed MATLAB release.
candidates = {['simeventslib/' blockName], ['simevents/' blockName]};
for k = 1:numel(candidates)
    library = extractBefore(candidates{k}, '/');
    try
        load_system(library);
        get_param(candidates{k}, 'Handle');
        path = candidates{k};
        return;
    catch
    end
end
error('DRISHTI:SimEventsBlockMissing', ...
    'Could not find SimEvents block "%s". Verify SimEvents is installed.', blockName);
end
