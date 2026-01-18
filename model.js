/**
 * Neural Network Model for Permeability Prediction
 * Runs entirely in browser - no backend needed
 */

let modelWeights = null;
let scalerParams = null;
let modelLoaded = false;

// ReLU activation function
function relu(x) {
    return Math.max(0, x);
}

// Matrix multiplication: input (1D array) * weights (2D array) + bias (1D array)
function denseLayer(input, weights, bias, activation) {
    const output = [];
    const outputSize = bias.length;
    
    for (let i = 0; i < outputSize; i++) {
        let sum = bias[i];
        for (let j = 0; j < input.length; j++) {
            sum += input[j] * weights[j][i];
        }
        output.push(activation === 'relu' ? relu(sum) : sum);
    }
    
    return output;
}

// Forward pass through the network
function predict(input) {
    if (!modelLoaded) {
        throw new Error('Model not loaded');
    }
    
    // Scale input: (x - mean) / scale
    const scaledInput = input.map((val, i) => {
        return (val - scalerParams.X.mean[i]) / scalerParams.X.scale[i];
    });
    
    // Forward pass through layers
    let x = scaledInput;
    
    // Layer 1: Dense 128, ReLU
    x = denseLayer(x, modelWeights[0].weights[0], modelWeights[0].weights[1], 'relu');
    
    // Layer 2: Dense 64, ReLU
    x = denseLayer(x, modelWeights[1].weights[0], modelWeights[1].weights[1], 'relu');
    
    // Layer 3: Dense 32, ReLU
    x = denseLayer(x, modelWeights[2].weights[0], modelWeights[2].weights[1], 'relu');
    
    // Layer 4: Dense 32, ReLU
    x = denseLayer(x, modelWeights[3].weights[0], modelWeights[3].weights[1], 'relu');
    
    // Layer 5: Dense 1, Linear (output)
    x = denseLayer(x, modelWeights[4].weights[0], modelWeights[4].weights[1], 'linear');
    
    // Inverse scale output: x * scale + mean
    const scaledOutput = x[0] * scalerParams.y.scale + scalerParams.y.mean;
    
    // Output is log10(K), convert to K
    const log10K = scaledOutput;
    const K = Math.pow(10, log10K);
    
    return {
        Pred_log10K: log10K,
        Pred_Permeability: K
    };
}

// Load model weights and scaler parameters
async function loadModel() {
    try {
        console.log('Loading model weights...');
        const weightsResponse = await fetch('model_weights.json');
        modelWeights = await weightsResponse.json();
        
        console.log('Loading scaler parameters...');
        const scalerResponse = await fetch('scaler_params.json');
        scalerParams = await scalerResponse.json();
        
        modelLoaded = true;
        console.log('Model loaded successfully!');
        console.log('Scaler X mean:', scalerParams.X.mean);
        console.log('Scaler X scale:', scalerParams.X.scale);
        console.log('Scaler y mean:', scalerParams.y.mean);
        console.log('Scaler y scale:', scalerParams.y.scale);
        
        return true;
    } catch (error) {
        console.error('Failed to load model:', error);
        modelLoaded = false;
        return false;
    }
}

// Predict single sample
function predictSingle(porosity, particle_ratio, Df_mean, Dp_mean) {
    // Note: Df_mean and Dp_mean should be in micrometers (um)
    // Convert um to meters for the model (model was trained with meters)
    const Df_m = Df_mean * 1e-6;
    const Dp_m = Dp_mean * 1e-6;
    
    const input = [porosity, particle_ratio, Df_m, Dp_m];
    return predict(input);
}

// Predict batch
function predictBatch(data) {
    return data.map(function(row) {
        // Convert um to meters
        const Df_m = row.Df_mean * 1e-6;
        const Dp_m = row.Dp_mean * 1e-6;
        
        const input = [row.porosity, row.particle_ratio, Df_m, Dp_m];
        return predict(input);
    });
}

// Check if model is loaded
function isModelLoaded() {
    return modelLoaded;
}
