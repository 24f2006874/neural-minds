function [net, info] = module3_train_resnet(dataFolder, epochs)
% =========================================================================
% DRISHTI - MODULE 3: DR SEVERITY CLASSIFIER TRAINING (MATLAB version)
% =========================================================================
% Fine-tunes a pretrained ResNet-50 on fundus images organised as:
%
%     dataFolder/
%        train/  Level0/  Level1/  Level2/  Level3/  Level4/
%        val/    Level0/  ...
%        test/   Level0/  ...
%
% Works with the datasets named in the problem statement:
%   * APTOS 2019 (Kaggle)  - 5 ICDR levels 0-4
%   * IDRiD    (IEEE DataPort) - 5 ICDR levels 0-4
% Just arrange the images into the folder structure above.
%
% Requires: Deep Learning Toolbox
%           Deep Learning Toolbox Model for ResNet-50 Network (support pkg)
%
% Class imbalance (46.6% normal vs 2.8% severe in APTOS) is handled by
% RANDOM OVER-SAMPLING of rare classes - simple and effective.
% =========================================================================
if nargin < 2, epochs = 12; end
numClasses = 5;

% ---------- 1. data ----------
imdsTrain = imageDatastore(fullfile(dataFolder, 'train'), ...
    'IncludeSubfolders', true, 'LabelSource', 'foldernames');
[labels, counts] = countEachLabel(imdsTrain);
fprintf('Training images: %d\n', numel(imdsTrain.Files));
disp(labels);

% class-balanced over-sampling (fixes the 46.6% vs 2.8% imbalance)
maxCount = max(counts);
idx = [];
for i = 1:numel(counts)
    clsIdx = find(imdsTrain.Labels == labels(i));
    reps = ceil(maxCount / counts(i));
    idx = [idx, repmat(clsIdx, 1, reps)]; %#ok<AGROW>
end
rng(42);                       % reproducible
idx = idx(randperm(numel(idx)));
imdsTrain = subset(imdsTrain, idx);
fprintf('After class-balanced over-sampling: %d images\n', numel(imdsTrain.Files));

% ---------- 2. network: ResNet-50 transfer learning ----------
net = resnet50();                                   % ImageNet pretrained
lgraph = layerGraph(net);
lgraph = removeLayers(lgraph, {'fc1000', 'fc1000_softmax', 'ClassificationLayer_fc1000'});
newFc = fullyConnectedLayer(numClasses, 'Name', 'fc_dr', ...
    'WeightLearnRateFactor', 10, 'BiasLearnRateFactor', 10);
lgraph = addLayers(lgraph, newFc);
lgraph = connectLayers(lgraph, 'avg_pool', 'fc_dr');
lgraph = addLayers(lgraph, softmaxLayer('Name', 'softmax_dr'));
lgraph = connectLayers(lgraph, 'fc_dr', 'softmax_dr');
lgraph = addLayers(lgraph, classificationLayer('Name', 'output_dr'));
lgraph = connectLayers(lgraph, 'softmax_dr', 'output_dr');

% ---------- 3. augmentation (critical for small datasets) ----------
inputSize = net.Layers(1).InputSize;                % [224 224 3]
augmenter = imageDataAugmenter( ...
    'RandRotation', [-25, 25], ...
    'RandXReflection', true, ...
    'RandYReflection', true, ...
    'RandXScale', [0.85 1.15], ...
    'RandYScale', [0.85 1.15], ...
    'RandXTranslation', [-20 20], ...
    'RandYTranslation', [-20 20], ...
    'Brightness', [0.8 1.2]);
auimds = augmentedImageDatastore(inputSize(1:2), imdsTrain, ...
    'DataAugmentation', augmenter, 'ColorPreprocessing', 'gray2rgb');

% ---------- 4. training ----------
% Validation data must be a datastore (passing a folder path is unreliable
% across MATLAB releases). Same preprocessing as the training set.
imdsVal = imageDatastore(fullfile(dataFolder, 'val'), ...
    'IncludeSubfolders', true, 'LabelSource', 'foldernames');
auimdsVal = augmentedImageDatastore(inputSize(1:2), imdsVal, ...
    'ColorPreprocessing', 'gray2rgb');

% NOTE: on MATLAB R2024a+, trainNetwork still works but is deprecated;
% the modern call is:  trainnet(auimds, dlnetwork(lgraph), "crossentropy", options)
options = trainingOptions('adam', ...
    'InitialLearnRate', 3e-4, ...
    'MaxEpochs', epochs, ...
    'MiniBatchSize', 16, ...
    'Shuffle', 'every-epoch', ...
    'ValidationData', auimdsVal, ...
    'ValidationFrequency', 50, ...
    'ExecutionEnvironment', 'auto', ...       % uses GPU if available
    'Plots', 'training-progress', ...
    'Verbose', true);

[net, info] = trainNetwork(auimds, lgraph, options);

% ---------- 5. save ----------
save('drishti_dr_model.mat', 'net', 'info');
fprintf('Model saved -> drishti_dr_model.mat\n');
end
