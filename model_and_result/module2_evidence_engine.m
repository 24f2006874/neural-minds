function evidence = module2_evidence_engine(img, mask)
% =========================================================================
% DRISHTI - MODULE 2: CLINICAL EVIDENCE ENGINE (MATLAB version)
% =========================================================================
% Detects anatomical landmarks (optic disc, fovea, vessels) and lesions
% (microaneurysms, hemorrhages, hard exudates) + the DME risk flag.
% Same algorithms as the validated Python prototype:
%   vessels     : multi-scale tubular (Frangi/Sato-style) Hessian filter
%   MAs         : black-hat transform, noise-adaptive threshold, posterior pole
%   hemorrhages : black-hat with large kernel
%   exudates    : white top-hat on lightness + yellow confirmation in b*
%   optic disc  : brightest round blob after vessel removal
%   fovea       : darkest patch ~2.5 DD from the disc, towards image centre
% Requires: Image Processing Toolbox
% =========================================================================

mask = logical(mask);

% ---------- 1. blood vessels ----------
green = img(:,:,2);
greenC = adapthisteq(green, 'ClipLimit', 0.02, 'NumTiles', [8 8]);
vessels = vesselFilter(greenC, mask);
evidence.vessels = vessels;
evidence.vessel_density = sum(vessels(:)) / max(sum(mask(:)), 1);

% ---------- 2. optic disc ----------
od = detectOpticDisc(img, mask, vessels);
evidence.optic_disc = od;                 % [x y radius]

% ---------- 3. fovea ----------
evidence.fovea = findFovea(img, od, mask, vessels);

% ---------- 4. lesions ----------
[maMask, maCentres] = detectMicroaneurysms(img, mask, vessels, od);
[hemMask, hemCentres] = detectHemorrhages(img, mask, vessels, od, maMask);
[exMask, exCentres] = detectExudates(img, mask, od, vessels);
evidence.ma_mask = maMask;   evidence.ma_count = size(maCentres, 1);
evidence.hem_mask = hemMask; evidence.hem_count = size(hemCentres, 1);
evidence.ex_mask = exMask;   evidence.ex_count = size(exCentres, 1);

% ---------- 5. DME risk flag ----------
[risk, distDD, msg] = dmeRiskFlag(exCentres, evidence.fovea, od(3));
evidence.dme_risk = risk;
evidence.dme_distance_dd = distDD;
evidence.dme_message = msg;
end

% =========================================================================
function vessels = vesselFilter(green, mask)
% Multi-scale tubular vesselness (Hessian eigenvalues at several scales).
% Tube-like structures (vessels) -> high response. Blobs -> low response.
v = zeros(size(green), 'single');
for s = [1 2 3 4 5]
    hxx = imfilter(single(green), s^2 * gaussDeriv(s, 'xx'), 'replicate');
    hyy = imfilter(single(green), s^2 * gaussDeriv(s, 'yy'), 'replicate');
    hxy = imfilter(single(green), s^2 * gaussDeriv(s, 'xy'), 'replicate');
    tr = hxx + hyy;
    dt = sqrt((hxx - hyy).^2/4 + hxy.^2);
    l1 = tr/2 + dt;                       % largest  eigenvalue
    l2 = tr/2 - dt;                       % smallest eigenvalue
    resp = max(-l1, 0).^2;                % dark tube response
    v = max(v, resp / (max(resp(:)) + eps));
end
v = v / (max(v(:)) + eps);

% ADAPTIVE threshold: keep ~top 10% of vesselness inside the retina
vals = v(mask);
thr = min(max(prctile(vals(:), 90), 25/255), 70/255);
vessels = v > thr & mask;
vessels = imclose(vessels, strel('disk', 1));
vessels = bwareaopen(vessels, 40);
end

function k = gaussDeriv(sigma, which)
% Second derivatives of a 2-D Gaussian (Hessian building blocks)
r = ceil(3*sigma);
[x, y] = meshgrid(-r:r, -r:r);
g = exp(-(x.^2 + y.^2)/(2*sigma^2));
switch which
    case 'xx', k = ((x.^2/sigma^4) - 1/sigma^2) .* g;
    case 'yy', k = ((y.^2/sigma^4) - 1/sigma^2) .* g;
    case 'xy', k = (x .* y / sigma^4) .* g;
end
k = single(k / sum(abs(k(:))));
end

% =========================================================================
function od = detectOpticDisc(img, mask, vessels)
% Optic disc = brightest big round blob after vessels are smoothed away.
lab = rgb2lab(im2single(img));
L = lab(:,:,1);
L(~mask) = 0;
L = imclose(L, strel('disk', 17));        % merge vessels inside the disc
L = imgaussfilt(L, 10);
L(~mask) = 0;

t = max(prctile(L(mask), 98), 60);
cand = L > t;
stats = regionprops(cand, 'Centroid', 'Area', 'PixelIdxList');
if isempty(stats)
    [~, idx] = max(L(:));
    [cy, cx] = ind2sub(size(L), idx);
    od = [cx, cy, round(0.07*min(size(img,1), size(img,2)))];
    return;
end
[~, bi] = max([stats.Area]);              % biggest bright blob = the disc
c = stats(bi).Centroid;
[ys, xs] = ind2sub(size(L), stats(bi).PixelIdxList);
r = median(sqrt((xs - c(1)).^2 + (ys - c(2)).^2)) * 1.35;
rMin = 0.055*min(size(img,1), size(img,2));
rMax = 0.100*min(size(img,1), size(img,2));
od = [round(c(1)), round(c(2)), round(min(max(r, rMin), rMax))];
end

% =========================================================================
function fovea = findFovea(img, od, mask, vessels)
% Darkest small patch 1.6-3.0 disc-diameters from the disc, towards the
% image centre, away from vessels (the fovea has no vessels - avascular).
[H, W, ~] = size(img);
dd = 2*od(3);
dx = W/2 - od(1);  dy = H/2 - od(2);
n = hypot(dx, dy) + eps;  dx = dx/n;  dy = dy/n;

gray = rgb2gray(img);
gray = adapthisteq(gray, 'ClipLimit', 0.02, 'NumTiles', [8 8]);
inner = imerode(mask, strel('disk', 20));

fovea = [od(1) + dx*2.5*dd, od(2) + dy*2.5*dd];   % textbook fallback
bestDark = inf;
for dist = 1.6:0.1:3.0
    for ang = -30:5:30
        a = deg2rad(ang);
        px = round(od(1) + (dx*cos(a) - dy*sin(a))*dist*dd);
        py = round(od(2) + (dx*sin(a) + dy*cos(a))*dist*dd);
        if px < 1 || py < 1 || px > W || py > H || ~inner(py, px), continue; end
        y1 = max(1, py-14); y2 = min(H, py+14);
        x1 = max(1, px-14); x2 = min(W, px+14);
        patch = double(gray(y1:y2, x1:x2));
        pm = inner(y1:y2, x1:x2);
        if mean(pm(:)) < 0.6, continue; end
        dark = mean(patch(pm));
        dark = dark + 30 * mean(vessels(y1:y2, x1:x2) > 0);
        if dark < bestDark
            bestDark = dark;
            fovea = [px, py];
        end
    end
end
end

% =========================================================================
function [maMask, centres] = detectMicroaneurysms(img, mask, vessels, od)
% Black-hat transform + noise-adaptive threshold + posterior-pole restriction.
green = rgb2gray(img);
green = adapthisteq(green, 'ClipLimit', 0.025, 'NumTiles', [8 8]);
bh = imbothat(green, strel('disk', 4));       % small dark blobs light up

% posterior pole: within 3.5 DD of the disc, inside the eroded retina
[rr, cc] = meshgrid(1:size(mask,2), 1:size(mask,1));
pole = ((rr-od(1)).^2 + (cc-od(2)).^2 <= (3.5*2*od(3))^2) & imerode(mask, strel('disk', 25));

vals = double(bh(pole));
med = median(vals);
mad = median(abs(vals - med)) * 1.4826;       % robust noise estimate
thr = min(max(med + 3*mad, 16), 45);

m = bh > thr & pole;
m = m & ~(imdilate(vessels, strel('disk', 3)));
m((rr-od(1)).^2 + (cc-od(2)).^2 <= (1.2*od(3))^2) = false;  % remove disc

% size + shape filters (clinical microaneurysm sizes)
lab = bwlabel(bwareaopen(m, 5));
stats = regionprops(lab, 'Centroid', 'Area', 'BoundingBox');
maMask = false(size(m));
centres = zeros(0, 2);
for i = 1:numel(stats)
    a = stats(i).Area;
    bb = stats(i).BoundingBox;
    aspect = bb(3) / max(bb(4), 1);
    if a >= 5 && a <= 120 && aspect >= 0.35 && aspect <= 2.8
        maMask = maMask | (lab == i);
        centres(end+1, :) = stats(i).Centroid; %#ok<AGROW>
    end
end
end

% =========================================================================
function [hemMask, centres] = detectHemorrhages(img, mask, vessels, od, maMask)
% Black-hat with a BIG kernel -> only wide dark blobs (leaked blood) survive.
green = rgb2gray(img);
green = adapthisteq(green, 'ClipLimit', 0.025, 'NumTiles', [8 8]);
bh = imbothat(green, strel('disk', 12));

m = bh > 20 & mask;
m = m & ~(imdilate(vessels, strel('disk', 6)));
m = m & ~(imdilate(maMask, strel('disk', 4)));          % no double counting

[rr, cc] = meshgrid(1:size(m,2), 1:size(m,1));
m((rr-od(1)).^2 + (cc-od(2)).^2 <= (1.3*od(3))^2) = false;
m = bwareaopen(m, 120);

stats = regionprops(m, 'Centroid');
centres = zeros(numel(stats), 2);
for i = 1:numel(stats), centres(i,:) = stats(i).Centroid; end
hemMask = m;
end

% =========================================================================
function [exMask, centres] = detectExudates(img, mask, od, vessels)
% White top-hat on lightness (small BRIGHT spots) + yellow confirmation in
% the b* channel using a RELATIVE threshold (robust to camera colour cast).
lab = rgb2lab(im2single(img));
L = lab(:,:,1);
bch = lab(:,:,3);   % b* channel (yellow-blue axis)

th = imtophat(mat2gray(L), strel('disk', 7));
cand = imclose(th > 0.07, strel('disk', 3)) & mask;

bRef = prctile(bch(mask), 55);              % relative yellow threshold
cand = cand & (bch >= bRef);

% remove the optic disc (bright + yellowish but NOT an exudate!)
[rr, cc] = meshgrid(1:size(cand,2), 1:size(cand,1));
cand((rr-od(1)).^2 + (cc-od(2)).^2 <= (1.3*od(3))^2) = false;
cand = cand & ~(imdilate(vessels, strel('disk', 4)));
cand = bwareaopen(cand, 25);

stats = regionprops(cand, 'Centroid');
centres = zeros(numel(stats), 2);
for i = 1:numel(stats), centres(i,:) = stats(i).Centroid; end
exMask = cand;
end

% =========================================================================
function [risk, distDD, msg] = dmeRiskFlag(exCentres, fovea, discRadius)
% Clinical rule: exudates within 1 disc-diameter of the fovea -> DME risk
if isempty(exCentres)
    risk = false; distDD = NaN;
    msg = 'No exudates detected -> no DME risk flag';
    return;
end
dd = 2*discRadius;
d = hypot(exCentres(:,1) - fovea(1), exCentres(:,2) - fovea(2));
dmin = min(d);
distDD = dmin / dd;
if dmin < dd
    risk = true;
    msg = sprintf(['URGENT: exudate within %.2f DD of fovea -> possible DME. ' ...
                   'Refer to ophthalmologist immediately.'], distDD);
else
    risk = false;
    msg = sprintf('Closest exudate is %.2f DD from fovea (>1 DD) -> no immediate DME flag', distDD);
end
end
