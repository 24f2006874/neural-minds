function [decision, finalImg, report] = module1_quality_gate(img)
% =========================================================================
% DRISHTI - MODULE 1: THE TRUST GATE (MATLAB version)
% =========================================================================
% Quality assessment (focus / illumination / field of view) + the
% ACCEPT / ENHANCE / REJECT decision, identical logic to the Python
% prototype so results can be cross-checked.
%
% Inputs : img   - RGB fundus image (uint8, any size)
% Outputs: decision - 'ACCEPT' | 'ACCEPT_AFTER_ENHANCE' | 'REJECT'
%          finalImg - image to send to Module 2 (original or enhanced)
%          report   - struct with all quality metrics
% Requires: Image Processing Toolbox
% =========================================================================

report.mask = getRetinaMask(img);

[report.focus, report.laplacianVar] = focusScore(img, report.mask);
[report.illumination, report.meanBrightness] = illuminationScore(img, report.mask);
[report.fieldOfView, report.retinaCoverage] = fovScore(report.mask);

report.qualityScore = 0.40*report.focus + 0.30*report.illumination + 0.30*report.fieldOfView;

if report.qualityScore >= 0.80
    decision = 'ACCEPT';
    finalImg = img;
    report.reason = 'Image quality is good. Proceed to analysis.';
elseif report.qualityScore >= 0.50
    % --- ENHANCE and re-check ---
    enhanced = enhanceImage(img);
    rep2 = struct();
    rep2.mask = report.mask;
    [rep2.focus, rep2.laplacianVar] = focusScore(enhanced, rep2.mask);
    [rep2.illumination, rep2.meanBrightness] = illuminationScore(enhanced, rep2.mask);
    [rep2.fieldOfView, rep2.retinaCoverage] = fovScore(rep2.mask);
    rep2.qualityScore = 0.40*rep2.focus + 0.30*rep2.illumination + 0.30*rep2.fieldOfView;

    % Enhancement can fix brightness but NEVER blur (information is lost)
    if rep2.qualityScore >= 0.62 && rep2.focus >= 0.30
        decision = 'ACCEPT_AFTER_ENHANCE';
        finalImg = enhanced;
        report = rep2;
        report.enhanced = true;
        report.reason = 'Borderline image rescued by CLAHE enhancement.';
    else
        decision = 'REJECT';
        finalImg = img;
        report.reason = ['RECAPTURE NEEDED: enhancement could not rescue ' ...
                         'this image. Ask the health worker to retake the photo.'];
    end
else
    decision = 'REJECT';
    finalImg = img;
    report.reason = buildRejectReason(report);
end
end

% -------------------------------------------------------------------------
function mask = getRetinaMask(img)
% Binary mask of the retina (bright circle) inside the camera frame
gray = rgb2gray(img);
mask = gray > 15;                                   % retina brighter than bg
mask = imclose(mask, strel('disk', 8));            % fill small holes
mask = imopen(mask, strel('disk', 8));             % remove specks
mask = bwareaopen(mask, numel(mask)*0.05);         % keep main blob only
mask = uint8(mask)*255;
end

% -------------------------------------------------------------------------
function [score, lapVar] = focusScore(img, mask)
% Sharpness via Laplacian variance + Tenengrad, measured well INSIDE the
% retina (eroded mask) so borders/eyelids cannot inflate the score.
gray = im2single(rgb2gray(img));
inner = imerode(logical(mask), strel('disk', 12));
if ~any(inner(:))
    inner = logical(mask);
end

lap = imfilter(gray, fspecial('laplacian', 0.2));
lapVar = var(lap(inner));

% NOTE: MATLAB cannot index an expression directly, so we need a temporary:
[gx, gy] = imgradientxy(gray, 'sobel');
edgeEnergy = gx.^2 + gy.^2;
tenengrad = mean(edgeEnergy(inner));

s1 = 1 - exp(-lapVar/100);
s2 = 1 - exp(-tenengrad/2200);
score = 0.6*s1 + 0.4*s2;
if lapVar < 12
    score = min(score, 0.30);   % essentially featureless -> cannot rescue
end
end

% -------------------------------------------------------------------------
function [score, meanBright] = illuminationScore(img, mask)
% Average brightness + 8x8-grid uniformity (cheap cameras light unevenly)
gray = rgb2gray(img);
meanBright = mean(gray(logical(mask)));

if meanBright >= 60 && meanBright <= 200
    brightS = 1.0;
elseif meanBright < 60
    brightS = max(0, meanBright/60);
else
    brightS = max(0, (255-meanBright)/55);
end

% 8x8 grid uniformity
[H, W] = size(gray);
ch = floor(H/8); cw = floor(W/8);
means = zeros(1, 64); k = 0;
for i = 1:8
    for j = 1:8
        cellImg = gray((i-1)*ch+1:i*ch, (j-1)*cw+1:j*cw);
        cellMsk = mask((i-1)*ch+1:i*ch, (j-1)*cw+1:j*cw);
        if mean(cellMsk(:) > 0) > 0.4
            k = k + 1;
            means(k) = mean(cellImg(cellMsk > 0));
        end
    end
end
means = means(1:k);
if numel(means) < 4
    uniformS = 0;
else
    uniformS = exp(-std(means)/45);
end
score = 0.55*brightS + 0.45*uniformS;
end

% -------------------------------------------------------------------------
function [score, coverage] = fovScore(mask)
% Coverage of frame + fill of bounding box + circularity of the retina blob.
% (The Python prototype uses the same three sub-scores.)
m = logical(mask);
coverage = mean(m(:));
covS = min(max((coverage - 0.40)/(0.75 - 0.40), 0), 1);

stats = regionprops(m, 'Area', 'BoundingBox', 'Perimeter');
if ~isempty(stats) && stats(1).Area > 0
    area = stats(1).Area;
    bb = stats(1).BoundingBox;
    per = stats(1).Perimeter;
    fillS = min(area/(bb(3)*bb(4))/0.75, 1);        % healthy retina fills its bbox
    circ = 4*pi*area/max(per^2, eps);               % circularity: 1 = perfect circle
    shapeS = min(circ/0.85, 1);
else
    fillS = 0.5;
    shapeS = 0.5;
end
score = 0.45*covS + 0.30*fillS + 0.25*shapeS;
end

% -------------------------------------------------------------------------
function out = enhanceImage(img)
% CLAHE on the L channel + non-local-means denoising + gamma correction.
% (Same enhancement stack as the Python prototype and our PPT slide 6.)
lab = rgb2lab(im2single(img));

% --- CLAHE on lightness (uint8 path = safe across MATLAB versions) ---
L8 = im2uint8(lab(:,:,1)/100);                     % L in [0,1] -> uint8 [0,255]
L8 = adapthisteq(L8, 'ClipLimit', 0.02, 'NumTiles', [8 8]);
lab(:,:,1) = single(L8)/255*100;                   % back to Lab L scale
out = lab2rgb(lab);

% --- edge-preserving denoising (non-local means, as named in our PPT) ---
try
    out = imnlmfilt(out);
catch
    out = imgaussfilt(out, 0.8);                   % fallback: gentle blur
end

% --- gamma correction for very dark / over-exposed images ---
g = rgb2gray(out);
vals = g(g > 0.06);
if isempty(vals)
    mb = 0.5;
else
    mb = mean(vals);
end
if mb < 0.28
    out = out.^0.6;                                % brighten dark images
elseif mb > 0.75
    out = out.^1.4;                                % darken over-exposed images
end
out = im2uint8(min(max(out, 0), 1));
end

% -------------------------------------------------------------------------
function reason = buildRejectReason(report)
% A SPECIFIC recapture message for the health worker (field usability!)
reason = 'RECAPTURE NEEDED: ';
if report.focus < 0.35
    reason = [reason 'image too blurry - ask patient to hold still and refocus. '];
end
if report.illumination < 0.35
    reason = [reason 'bad lighting - check camera flash / room lighting. '];
end
if report.fieldOfView < 0.35
    reason = [reason 'retina not fully captured - realign camera closer to pupil.'];
end
end
