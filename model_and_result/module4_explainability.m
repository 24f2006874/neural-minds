function explanation = module4_explainability(net, img, evidence, qualityScore)
% =========================================================================
% DRISHTI - MODULE 4: EXPLAINABILITY + CONSISTENCY CHECK (MATLAB version)
% =========================================================================
% THE INNOVATION MODULE:
%   Step 1: Grad-CAM heatmap from the CNN        (WHERE did the AI look?)
%   Step 2: lesion evidence from Module 2        (WHAT should it have seen?)
%   Step 3: consistency metrics between the two  (do they agree?)
%   Step 4: TRUST score -> auto recommendation or human review
%
% Requires: Deep Learning Toolbox (gradCAM available since R2021a)
% Inputs:
%   net           - trained network (from module3_train_resnet)
%   img           - RGB fundus image (uint8)
%   evidence      - struct from module2_evidence_engine
%   qualityScore  - image quality score from Module 1 (0..1)
% =========================================================================

classes = {'No DR (Level 0)', 'NPDR mild (Level 1)', 'NPDR moderate (Level 2)', ...
           'NPDR severe (Level 3)', 'PDR (Level 4)'};

% ---------- Step 1: classify + Grad-CAM ----------
% NOTE: gradCAM expects an index into the network's OWN class list (which
% comes sorted from the training folder names Level0..Level4). We take the
% predicted index from the SCORES vector, NOT by matching label text.
inputSize = net.Layers(1).InputSize;
imgResized = imresize(img, [inputSize(1) inputSize(2)]);
[YPred, scores] = classify(net, imgResized);
[~, predIdx] = max(scores);              % index into the network's class list

% Grad-CAM: attention heatmap for the predicted class
try
    map = gradCAM(net, imgResized, predIdx);
catch
    try
        map = gradCAM(net, imgResized, double(YPred));  % some releases want the label
    catch ME
        error('DRISHTI:gradCAM', ...
            'gradCAM failed (%s). Requires Deep Learning Toolbox R2021a+.', ME.message);
    end
end
map = map / (max(map(:)) + eps);

% ---------- Step 2+3: consistency check ----------
consistency = consistencyCheck(map, evidence, size(img));

% ---------- Step 4: trust score ----------
confidence = max(scores);
trust = 0.35*qualityScore + 0.35*confidence + 0.30*consistency.consistency;
if trust >= 0.76
    level = 'HIGH';   route = 'TRUSTED - auto screening recommendation';
elseif trust >= 0.55
    level = 'MODERATE'; route = 'REVIEW - queue for ophthalmologist';
else
    level = 'LOW';    route = 'HUMAN REVIEW REQUIRED - do not act on AI alone';
end

explanation.predicted_class = predIdx;
explanation.predicted_label = classes{predIdx};
explanation.confidence = double(confidence);
explanation.scores = scores;
explanation.gradcam = map;
explanation.consistency = consistency;
explanation.trust_score = trust;
explanation.trust_level = level;
explanation.route = route;
end

% =========================================================================
function c = consistencyCheck(map, evidence, imgSize)
% Compares the Grad-CAM attention (resized to the original image) with the
% lesion evidence. Same three metrics as the Python prototype:
%   1. centroid distance - heatmap peak vs nearest lesion (in disc diameters)
%   2. region overlap    - fraction of heatmap energy on lesion areas
%   3. evidence agreement- lesion load supports the same story
mapF = imresize(map, imgSize(1:2));
[h, w] = size(mapF);
od = evidence.optic_disc;
dd = 2*od(3);

lesionCentres = [evidence.ma_centres; evidence.hem_centres; evidence.ex_centres];
lesionMask = evidence.ma_mask | evidence.hem_mask | evidence.ex_mask;
lesionZone = imdilate(logical(lesionMask), strel('disk', 12));

% --- metric 1: centroid distance ---
if ~isempty(lesionCentres)
    [~, idx] = max(mapF(:));
    [py, px] = ind2sub(size(mapF), idx);
    d = hypot(lesionCentres(:,1)-px, lesionCentres(:,2)-py);
    centroidDistDD = min(d) / dd;
    mCentroid = min(max(1 - centroidDistDD/3, 0), 1);
else
    centroidDistDD = NaN;
    mCentroid = 0.6;
end

% --- metric 2: region overlap ---
totE = sum(mapF(:));
if totE > 0 && any(lesionZone(:))
    mOverlap = min(sum(mapF(lesionZone))/totE/0.30, 1);
elseif ~any(lesionZone(:))
    mOverlap = 0.6;
else
    mOverlap = 0;
end

% --- metric 3: evidence agreement ---
load = evidence.ma_count*1.0 + evidence.hem_count*2.0 + evidence.ex_count*1.5;
if load > 0
    mAgree = 0.5 + 0.5*min(load/80, 1);
else
    mAgree = 0.5;
end

c.consistency = 0.4*mCentroid + 0.4*mOverlap + 0.2*mAgree;
if c.consistency >= 0.55,      c.verdict = 'HIGH';
elseif c.consistency >= 0.40,  c.verdict = 'MODERATE';
else,                          c.verdict = 'LOW';
end
c.centroid_distance_dd = centroidDistDD;
c.region_overlap = mOverlap;
c.evidence_agreement = mAgree;
end
