function result = DRISHTI(imagePath, patientID)
% =========================================================================
% DRISHTI - MAIN PIPELINE (MATLAB)
% =========================================================================
% Explainable AI for Diabetic Retinopathy Screening in Rural India
% SIH 2026 - Problem Statement 26038 (MathWorks)
%
% Runs the complete 5-module screening pipeline on one fundus image:
%   Module 1: Trust Gate (quality: accept / enhance / reject)
%   Module 2: Clinical Evidence Engine (vessels, OD, fovea, lesions)
%   Module 3: CNN DR grading (ResNet-50, ICDR 0-4)   [needs trained model]
%   Module 4: Grad-CAM + Consistency Check + Trust score
%   (Module 5: run module5_build_simulink.m separately for capacity planning)
%
% USAGE:
%   result = DRISHTI('patient_image.png', 'PHC-001');
%
% =========================================================================
if nargin < 2, patientID = 'DEMO-001'; end

fprintf('\nDRISHTI PIPELINE | patient %s | %s\n', patientID, imagePath);
fprintf('------------------------------------------------------------\n');
img = imread(imagePath);

% ============ MODULE 1: TRUST GATE ============
fprintf('[1/4] Module 1 - Trust Gate (quality assessment)\n');
[decision, finalImg, quality] = module1_quality_gate(img);
fprintf('       decision = %s (quality %.2f)\n', decision, quality.qualityScore);

if strcmp(decision, 'REJECT')
    fprintf('[X] REJECTED: %s\n', quality.reason);
    result = struct('patient_id', patientID, 'gate', 'REJECT', ...
                    'reason', quality.reason);
    return;
end

% ============ MODULE 2: EVIDENCE ENGINE ============
fprintf('[2/4] Module 2 - Evidence Engine (lesions + anatomy)\n');
evidence = module2_evidence_engine(finalImg, quality.mask);
fprintf('       MAs=%d  hemorrhages=%d  exudates=%d  DME risk=%d\n', ...
    evidence.ma_count, evidence.hem_count, evidence.ex_count, evidence.dme_risk);

% ============ MODULE 3+4: CLASSIFY + EXPLAIN ============
fprintf('[3/4] Module 3 - CNN classification\n');
fprintf('[4/4] Module 4 - Grad-CAM + consistency + trust\n');
if exist('drishti_dr_model.mat', 'file')
    S = load('drishti_dr_model.mat');
    explanation = module4_explainability(S.net, finalImg, evidence, ...
                                         quality.qualityScore);
    fprintf('       prediction = %s (confidence %.0f%%)\n', ...
        explanation.predicted_label, 100*explanation.confidence);
    fprintf('       consistency = %.2f (%s) | trust = %.2f (%s)\n', ...
        explanation.consistency.consistency, explanation.consistency.verdict, ...
        explanation.trust_score, explanation.trust_level);
    fprintf('       route: %s\n', explanation.route);
else
    % Model not trained yet? Fall back to EVIDENCE-BASED grading
    % (clinical rules from the ICDR scale - same idea as the Python proto)
    fprintf('       (no trained model found - using evidence-based grading)\n');
    explanation = evidenceBasedGrading(evidence, quality.qualityScore);
end

% ============ RESULT PACKAGE ============
result.patient_id = patientID;
result.quality = quality;
result.evidence = rmfield(evidence, {'vessels','ma_mask','hem_mask','ex_mask'});
% 'gradcam' exists only in the CNN path (not the evidence-based fallback)
if isfield(explanation, 'gradcam')
    explanation = rmfield(explanation, 'gradcam');
end
result.explanation = explanation;
result.recommendation = recommendationFor(explanation, evidence);

% ============ SAVE THE 30-SECOND REPORT ============
reportPath = sprintf('%s_report.png', patientID);
exportReport(img, finalImg, evidence, explanation, result, reportPath);
fprintf('\n[REPORT] saved -> %s\n', reportPath);
end

% =========================================================================
function expl = evidenceBasedGrading(ev, qualityScore)
% ICDR-inspired rules when the CNN is not available:
%   Level 0: no lesions | Level 1: few MAs | Level 2: MAs + hemorrhages/exudates
%   Level 3: many hemorrhages | Level 4: extensive lesions (neovascularisation
%   needs specialist review - flagged by very high lesion load)
load_ = ev.ma_count*1.0 + ev.hem_count*2.0 + ev.ex_count*1.5;
if load_ == 0
    cls = 1; label = 'No DR (Level 0)';
elseif ev.hem_count == 0 && ev.ex_count == 0 && ev.ma_count <= 5
    cls = 2; label = 'NPDR mild (Level 1)';
elseif load_ < 100
    cls = 3; label = 'NPDR moderate (Level 2)';
elseif load_ < 250
    cls = 4; label = 'NPDR severe (Level 3)';
else
    cls = 5; label = 'PDR (Level 4) - urgent';
end
consistency = min(0.5 + load_/200, 1);      % evidence directly supports grade
expl.predicted_class = cls;
expl.predicted_label = label;
expl.confidence = min(0.55 + load_/300, 0.95);
expl.consistency.consistency = consistency;
expl.consistency.verdict = 'EVIDENCE-BASED';
expl.trust_score = 0.35*qualityScore + 0.35*expl.confidence + 0.30*consistency;
if expl.trust_score >= 0.76
    expl.trust_level = 'HIGH';
    expl.route = 'TRUSTED - auto screening recommendation';
elseif expl.trust_score >= 0.55
    expl.trust_level = 'MODERATE';
    expl.route = 'REVIEW - queue for ophthalmologist';
else
    expl.trust_level = 'LOW';
    expl.route = 'HUMAN REVIEW REQUIRED - do not act on AI alone';
end
end

% =========================================================================
function rec = recommendationFor(expl, ev)
lvl = expl.predicted_class;
if lvl <= 1
    rec = 'No DR - re-screen in 12 months';
elseif lvl <= 3
    rec = 'Referable DR - see ophthalmologist within 3 months';
else
    rec = 'Severe/PDR - URGENT referral within 4 weeks';
end
if isfield(ev, 'dme_risk') && ev.dme_risk
    rec = [rec ' + DME ALERT: exudates near fovea - refer urgently'];
end
end

% =========================================================================
function exportReport(img, enhanced, ev, expl, result, outPath)
% The 30-second clinical report (2 rows of panels + summary card)
figure('Color', 'k', 'Position', [50 50 1500 700]);

subplot(2,4,1); imshow(img);
title('1. Original', 'Color', 'w');
subplot(2,4,2); imshow(enhanced);
title('2. Enhanced (CLAHE)', 'Color', 'w');

% ---- 3. Grad-CAM panel ----
subplot(2,4,3);
try
    heatmap = imresize(expl.gradcam, size(enhanced, [1 2]));
    imshow(enhanced); hold on;
    himg = imagesc(heatmap); himg.AlphaData = 0.45; axis image off;
    title('3. Grad-CAM attention', 'Color', 'w');
catch
    imshow(enhanced);
    title('3. Grad-CAM (train model first)', 'Color', 'w');
end

% ---- 4. lesion evidence panel ----
subplot(2,4,4);
imshow(enhanced); hold on;
od = ev.optic_disc;
rectangle('Position', [od(1)-od(3), od(2)-od(3), 2*od(3), 2*od(3)], ...
    'Curvature', [1 1], 'EdgeColor', 'b', 'LineWidth', 2);
f = ev.fovea;
plot(f(1), f(2), 'y+', 'MarkerSize', 16, 'LineWidth', 2);
if ~isempty(ev.ma_centres)
    plot(ev.ma_centres(:,1), ev.ma_centres(:,2), 'co', 'MarkerSize', 4, 'LineWidth', 1);
end
if ~isempty(ev.hem_centres)
    plot(ev.hem_centres(:,1), ev.hem_centres(:,2), 'r.', 'MarkerSize', 18);
end
if ~isempty(ev.ex_centres)
    plot(ev.ex_centres(:,1), ev.ex_centres(:,2), 'm.', 'MarkerSize', 18);
end
title('4. Lesion evidence (OD, fovea, MAs, HEM, EX)', 'Color', 'w');

% ---- summary card ----
subplot(2,4,5:8); axis off;
text(0.02, 0.85, sprintf('DRISHTI SCREENING REPORT - %s', result.patient_id), ...
    'FontSize', 14, 'FontWeight', 'bold', 'Color', 'w');
text(0.02, 0.68, expl.predicted_label, 'FontSize', 16, ...
    'FontWeight', 'bold', 'Color', [1 0.6 0.2]);
text(0.02, 0.52, sprintf('Confidence: %.0f%%   |   Trust: %.2f (%s)', ...
    100*expl.confidence, expl.trust_score, expl.trust_level), ...
    'FontSize', 11, 'Color', 'w');
text(0.02, 0.38, sprintf('Evidence: %d MAs | %d hemorrhages | %d exudates', ...
    ev.ma_count, ev.hem_count, ev.ex_count), 'FontSize', 11, 'Color', 'w');
text(0.02, 0.24, result.recommendation, 'FontSize', 11, 'Color', [1 1 0.3]);
text(0.02, 0.10, 'Human-in-the-loop: ophthalmologist verifies in <30 s', ...
    'FontSize', 9, 'Color', [0.7 0.7 0.7]);

exportgraphics(gcf, outPath, 'Resolution', 150);
end
