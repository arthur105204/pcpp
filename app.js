/**
 * Tinh do tham cau truc xop composite
 * Runs entirely in browser - no backend needed!
 */

let csvData = null;
let csvCols = [];
let results = null;
let unit = 'um';
let loadedFileName = '';

// DOM elements
let dom = {};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async function() {
    dom = {
        form: document.getElementById('prediction-form'),
        calcBtn: document.getElementById('calc-btn'),
        clearBtn: document.getElementById('clear-btn'),
        resultValue: document.getElementById('result-value'),
        porosity: document.getElementById('porosity'),
        porositySlider: document.getElementById('porosity-slider'),
        particleRatio: document.getElementById('particle_ratio'),
        particleRatioSlider: document.getElementById('particle_ratio-slider'),
        dfMean: document.getElementById('Df_mean'),
        dpMean: document.getElementById('Dp_mean'),
        csvInput: document.getElementById('csv-input'),
        dropzone: document.getElementById('dropzone'),
        batchBtn: document.getElementById('batch-btn'),
        downloadBtn: document.getElementById('download-btn'),
        fileInfo: document.getElementById('file-info'),
        table: document.getElementById('data-table'),
        tableHeader: document.getElementById('table-header'),
        tableBody: document.getElementById('table-body'),
        emptyState: document.getElementById('empty-state'),
        chartK: document.getElementById('chart-k'),
        toast: document.getElementById('toast')
    };
    
    initSliders();
    initEvents();
    initCharts();
    
    // Load the neural network model
    var loaded = await loadModel();
    if (loaded) {
        toast('Model loaded - ready!', 'success');
    } else {
        toast('Model loading failed', 'error');
    }
});

function initSliders() {
    if (dom.porosity && dom.porositySlider) {
        dom.porosity.addEventListener('input', function() { dom.porositySlider.value = this.value; });
        dom.porositySlider.addEventListener('input', function() { dom.porosity.value = this.value; });
    }
    if (dom.particleRatio && dom.particleRatioSlider) {
        dom.particleRatio.addEventListener('input', function() { dom.particleRatioSlider.value = this.value; });
        dom.particleRatioSlider.addEventListener('input', function() { dom.particleRatio.value = this.value; });
    }
}

function initEvents() {
    // Unit switch
    document.querySelectorAll('input[name="unit"]').forEach(function(radio) {
        radio.addEventListener('change', function(e) {
            unit = e.target.value;
        });
    });
    
    // Form submit
    if (dom.form) {
        dom.form.addEventListener('submit', handlePredict);
    }
    
    // Clear button
    if (dom.clearBtn) {
        dom.clearBtn.addEventListener('click', handleClear);
    }
    
    // File upload - dropzone
    if (dom.dropzone && dom.csvInput) {
        dom.csvInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (file) processFile(file);
        });
        
        // Drag and drop
        dom.dropzone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dom.dropzone.classList.add('dragover');
        });
        
        dom.dropzone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            dom.dropzone.classList.remove('dragover');
        });
        
        dom.dropzone.addEventListener('drop', function(e) {
            e.preventDefault();
            dom.dropzone.classList.remove('dragover');
            var file = e.dataTransfer.files[0];
            if (file) processFile(file);
        });
    }
    
    // Batch calculate
    if (dom.batchBtn) {
        dom.batchBtn.addEventListener('click', handleBatch);
    }
    
    // Download
    if (dom.downloadBtn) {
        dom.downloadBtn.addEventListener('click', handleDownload);
    }
}

// Get responsive chart settings based on screen width
function getChartLayout() {
    var isMobile = window.innerWidth < 600;
    var isTablet = window.innerWidth < 900;
    
    var fontSize = isMobile ? 8 : (isTablet ? 9 : 10);
    var tickFontSize = isMobile ? 7 : (isTablet ? 8 : 9);
    var marginL = isMobile ? 45 : (isTablet ? 55 : 65);
    var marginB = isMobile ? 35 : (isTablet ? 40 : 45);
    var marginR = isMobile ? 10 : (isTablet ? 15 : 20);
    var standoff = isMobile ? 5 : 8;
    
    return {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'DM Sans, sans-serif', size: fontSize },
        margin: { t: 8, r: marginR, b: marginB, l: marginL },
        xaxis: { 
            gridcolor: '#e2e8f0', 
            zerolinecolor: '#e2e8f0',
            tickfont: { size: tickFontSize },
            title: { font: { size: fontSize }, standoff: standoff },
            automargin: true
        },
        yaxis: { 
            gridcolor: '#e2e8f0', 
            zerolinecolor: '#e2e8f0',
            tickfont: { size: tickFontSize },
            title: { font: { size: fontSize }, standoff: standoff },
            automargin: true
        }
    };
}

function getChartConfig() {
    return { 
        responsive: true, 
        displayModeBar: false,
        staticPlot: true  // Disable all interactions
    };
}

function initCharts() {
    var layout = getChartLayout();
    var config = getChartConfig();
    
    if (dom.chartK) {
        Plotly.newPlot(dom.chartK, [], {
            ...layout,
            xaxis: { ...layout.xaxis, title: { text: 'Độ xốp', ...layout.xaxis.title } },
            yaxis: { ...layout.yaxis, title: { text: 'K (m2)', ...layout.yaxis.title }, exponentformat: 'e' }
        }, config);
    }
}

// Handle window resize for charts
var resizeTimeout;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
        // Re-layout charts on resize
        if (dom.chartK) {
            Plotly.relayout(dom.chartK, getChartLayout());
        }
    }, 150);
});

// Process CSV file
function processFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        toast('Chỉ chấp nhận file CSV', 'error');
        return;
    }
    
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: function(result) {
            console.log('CSV parsed:', result);
            
            if (result.errors.length > 0) {
                toast('Lỗi đọc file: ' + result.errors[0].message, 'error');
                return;
            }
            
            // Get column names
            csvCols = result.meta.fields || [];
            loadedFileName = file.name;
            
            console.log('Columns found:', csvCols);
            console.log('Total rows:', result.data.length);
            
            // Check if required columns exist
            var requiredCols = ['porosity', 'particle_ratio', 'Df_mean', 'Dp_mean'];
            var missingCols = requiredCols.filter(function(col) {
                return csvCols.indexOf(col) === -1;
            });
            
            if (missingCols.length > 0) {
                toast('Thiếu cột: ' + missingCols.join(', '), 'error');
                console.error('Missing columns:', missingCols);
                console.log('Available columns:', csvCols);
                return;
            }
            
            // Store raw data for later (to check for True K)
            var rawData = result.data;
            
            // Filter valid rows - only keep the 4 required fields for API
            var validRows = [];
            var trueKValues = [];
            var skippedRows = 0;
            var skipReasons = [];
            
            for (var i = 0; i < rawData.length; i++) {
                var row = rawData[i];
                var p = parseFloat(row.porosity);
                var pr = parseFloat(row.particle_ratio);
                var df = parseFloat(row.Df_mean);
                var dp = parseFloat(row.Dp_mean);
                
                // Check if values are valid numbers
                if (isNaN(p) || isNaN(pr) || isNaN(df) || isNaN(dp)) {
                    skippedRows++;
                    if (skipReasons.length < 3) {
                        skipReasons.push('Row ' + i + ': NaN values - p=' + p + ', pr=' + pr + ', df=' + df + ', dp=' + dp);
                    }
                    continue;
                }
                
                // Check API constraints: porosity and particle_ratio in [0,1], Df_mean and Dp_mean > 0
                if (p < 0 || p > 1 || pr < 0 || pr > 1 || df <= 0 || dp <= 0) {
                    skippedRows++;
                    if (skipReasons.length < 3) {
                        skipReasons.push('Row ' + i + ': Invalid range - p=' + p + ', pr=' + pr + ', df=' + df + ', dp=' + dp);
                    }
                    continue;
                }
                
                // Only include the 4 required fields for API
                validRows.push({
                    porosity: p,
                    particle_ratio: pr,
                    Df_mean: df,
                    Dp_mean: dp
                });
                
                // Store True K if exists (for parity plot later)
                var trueK = row.K !== undefined ? row.K : (row.True_K !== undefined ? row.True_K : (row.Permeability !== undefined ? row.Permeability : null));
                trueKValues.push(trueK);
            }
            
            // Log skip reasons for debugging
            if (skipReasons.length > 0) {
                console.warn('Skip reasons (first 3):', skipReasons);
            }
            console.log('Valid rows:', validRows.length, 'Skipped:', skippedRows);
            
            if (validRows.length === 0) {
                toast('Không có dòng hợp lệ (kiểm tra Console để biết chi tiết)', 'error');
                return;
            }
            
            csvData = validRows;
            csvData._trueK = trueKValues; // Store true K separately
            results = null;
            
            // Clear previous charts
            initCharts();
            
            // Update UI
            if (dom.dropzone) dom.dropzone.classList.add('loaded');
            if (dom.fileInfo) {
                dom.fileInfo.innerHTML = 
                    'Loaded: ' + loadedFileName + '<br>' +
                    'Rows: ' + csvData.length + '<br>' +
                    "Cols: ['porosity', 'particle_ratio', 'Df_mean', 'Dp_mean']";
            }
            
            if (dom.batchBtn) dom.batchBtn.disabled = false;
            if (dom.downloadBtn) dom.downloadBtn.disabled = true;
            
            renderTable(csvData, false);
            
            if (skippedRows > 0) {
                toast('Đã tải ' + csvData.length + ' dòng (bỏ qua ' + skippedRows + ' dòng không hợp lệ)', 'success');
            } else {
                toast('Đã tải ' + csvData.length + ' dòng', 'success');
            }
        },
        error: function(err) {
            toast('Lỗi: ' + err.message, 'error');
        }
    });
}

// Single prediction - uses local model
async function handlePredict(e) {
    e.preventDefault();
    
    if (!isModelLoaded()) {
        toast('Model chưa được tải', 'error');
        return;
    }
    
    var input = getInput();
    if (!validateInput(input)) return;
    
    setLoading(dom.calcBtn, true);
    
    try {
        // Use local model - input is in um
        var data = predictSingle(input.porosity, input.particle_ratio, input.Df_mean, input.Dp_mean);
        
        showResult(data);
        
        // Display single result in table
        var singleResult = [{
            porosity: input.porosity,
            particle_ratio: input.particle_ratio,
            Df_mean: input.Df_mean,
            Dp_mean: input.Dp_mean,
            Pred_log10K: data.Pred_log10K,
            Pred_Permeability: data.Pred_Permeability
        }];
        renderTable(singleResult, true);
        
        // Update chart with single point
        updateCharts(singleResult);
        
        toast('Tính toán thành công', 'success');
    } catch (err) {
        console.error(err);
        toast('Lỗi: ' + err.message, 'error');
    } finally {
        setLoading(dom.calcBtn, false);
    }
}

function getInput() {
    var df = parseFloat(dom.dfMean.value);
    var dp = parseFloat(dom.dpMean.value);
    
    // Model expects values in micrometers (um)
    // If user selected 'm', convert m to um (multiply by 1e6)
    if (unit === 'm') {
        df *= 1e6;
        dp *= 1e6;
    }
    // Input is already in um, no conversion needed
    
    return {
        porosity: parseFloat(dom.porosity.value),
        particle_ratio: parseFloat(dom.particleRatio.value),
        Df_mean: df,
        Dp_mean: dp
    };
}

function validateInput(d) {
    if (d.porosity < 0 || d.porosity > 1) {
        toast('Độ xốp phải từ 0-1', 'error');
        return false;
    }
    if (d.particle_ratio < 0 || d.particle_ratio > 1) {
        toast('Tỉ lệ hạt phải từ 0-1', 'error');
        return false;
    }
    if (d.Df_mean <= 0 || d.Dp_mean <= 0) {
        toast('Đường kính phải > 0', 'error');
        return false;
    }
    return true;
}

function showResult(data) {
    if (dom.resultValue) {
        dom.resultValue.textContent = data.Pred_Permeability.toExponential(4);
    }
}

function handleClear() {
    // Reset form inputs
    if (dom.porosity) dom.porosity.value = '0.75';
    if (dom.porositySlider) dom.porositySlider.value = '0.75';
    if (dom.particleRatio) dom.particleRatio.value = '0.54';
    if (dom.particleRatioSlider) dom.particleRatioSlider.value = '0.54';
    if (dom.dfMean) dom.dfMean.value = '3.0';
    if (dom.dpMean) dom.dpMean.value = '3.0';
    if (dom.resultValue) dom.resultValue.textContent = '?';
    
    // Clear CSV data
    csvData = null;
    csvCols = [];
    results = null;
    loadedFileName = '';
    
    // Reset file input
    if (dom.csvInput) dom.csvInput.value = '';
    
    // Reset dropzone
    if (dom.dropzone) dom.dropzone.classList.remove('loaded');
    
    // Clear file info
    if (dom.fileInfo) dom.fileInfo.innerHTML = '';
    
    // Reset buttons
    if (dom.batchBtn) dom.batchBtn.disabled = true;
    if (dom.downloadBtn) dom.downloadBtn.disabled = true;
    
    // Clear table
    if (dom.tableBody) dom.tableBody.innerHTML = '';
    if (dom.table) dom.table.classList.remove('visible');
    if (dom.emptyState) dom.emptyState.classList.remove('hidden');
    
    // Reset charts
    initCharts();
    
    toast('Đã xóa', 'success');
}

// Batch prediction - uses local model
// Note: CSV data is always expected in micrometers (um)
// The unit switch only affects manual form input, not CSV batch data
async function handleBatch() {
    if (!csvData || csvData.length === 0) return;
    
    if (!isModelLoaded()) {
        toast('Model chưa được tải', 'error');
        return;
    }
    
    setLoading(dom.batchBtn, true);
    
    try {
        // Use local model for predictions (CSV data is always in um)
        var predictions = predictBatch(csvData);
        
        // Combine input data with predictions
        var trueKValues = csvData._trueK || [];
        results = csvData.map(function(row, i) {
            return {
                porosity: row.porosity,
                particle_ratio: row.particle_ratio,
                Df_mean: row.Df_mean,
                Dp_mean: row.Dp_mean,
                Pred_log10K: predictions[i].Pred_log10K,
                Pred_Permeability: predictions[i].Pred_Permeability,
                True_K: trueKValues[i]
            };
        });
        
        renderTable(results, true);
        updateCharts(results);
        if (dom.downloadBtn) dom.downloadBtn.disabled = false;
        
        // Show K range in result box
        var kValues = results.map(function(r) { return r.Pred_Permeability; }).filter(function(v) { return isFinite(v); });
        if (kValues.length > 0 && dom.resultValue) {
            var minK = Math.min.apply(null, kValues);
            var maxK = Math.max.apply(null, kValues);
            if (minK === maxK) {
                dom.resultValue.textContent = minK.toExponential(2);
            } else {
                dom.resultValue.textContent = minK.toExponential(2) + ' ~ ' + maxK.toExponential(2);
            }
        }
        
        toast('Đã tính ' + results.length + ' trường hợp', 'success');
    } catch (err) {
        console.error(err);
        toast('Lỗi: ' + err.message, 'error');
    } finally {
        setLoading(dom.batchBtn, false);
    }
}

function renderTable(data, hasResults) {
    if (dom.emptyState) dom.emptyState.classList.add('hidden');
    if (dom.table) dom.table.classList.add('visible');
    if (dom.tableBody) dom.tableBody.innerHTML = '';
    
    // Update header with Vietnamese labels
    if (dom.tableHeader) {
        if (hasResults) {
            dom.tableHeader.innerHTML = 
                '<th></th><th>Độ xốp</th><th>Tỉ lệ hạt</th><th>ĐK sợi trung bình</th><th>ĐK hạt trung bình</th><th>Độ thẩm</th>';
        } else {
            dom.tableHeader.innerHTML = 
                '<th></th><th>Độ xốp</th><th>Tỉ lệ hạt</th><th>ĐK sợi trung bình</th><th>ĐK hạt trung bình</th>';
        }
    }
    
    // First 30 rows only (preview)
    var rows = data.slice(0, 30);
    
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var tr = document.createElement('tr');
        
        if (hasResults) {
            tr.innerHTML = 
                '<td>' + i + '</td>' +
                '<td>' + row.porosity.toFixed(2) + '</td>' +
                '<td>' + row.particle_ratio.toFixed(2) + '</td>' +
                '<td>' + row.Df_mean.toFixed(2) + '</td>' +
                '<td>' + row.Dp_mean.toFixed(2) + '</td>' +
                '<td>' + row.Pred_Permeability.toExponential(6) + '</td>';
        } else {
            tr.innerHTML = 
                '<td>' + i + '</td>' +
                '<td>' + row.porosity.toFixed(2) + '</td>' +
                '<td>' + row.particle_ratio.toFixed(2) + '</td>' +
                '<td>' + row.Df_mean.toFixed(2) + '</td>' +
                '<td>' + row.Dp_mean.toFixed(2) + '</td>';
        }
        
        if (dom.tableBody) dom.tableBody.appendChild(tr);
    }
}

function updateCharts(data) {
    var lineColor = '#14b8a6';
    var isMobile = window.innerWidth < 600;
    var markerSize = isMobile ? 6 : 8;
    var lineWidth = isMobile ? 2 : 3;
    
    // Predicted K vs porosity - sort by porosity for proper line connection
    var sortedData = data.slice().sort(function(a, b) { return a.porosity - b.porosity; });
    var porosityVals = sortedData.map(function(r) { return r.porosity; });
    var kVals = sortedData.map(function(r) { return r.Pred_Permeability; });
    
    if (dom.chartK) {
        var trace = {
            x: porosityVals,
            y: kVals,
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: lineColor, width: lineWidth, shape: 'linear' },
            marker: { size: markerSize, color: lineColor },
            connectgaps: true
        };
        
        var chartLayout = {
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { family: 'DM Sans, sans-serif', size: 10 },
            margin: { t: 10, r: 20, b: 50, l: 70 },
            xaxis: { 
                title: 'Độ xốp',
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0'
            },
            yaxis: { 
                title: 'K (m2)',
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                exponentformat: 'e'
            }
        };
        
        Plotly.react(dom.chartK, [trace], chartLayout, { responsive: true, displayModeBar: false });
    }
}

function handleDownload() {
    if (!results) return;
    
    var headers = ['porosity', 'particle_ratio', 'Df_mean', 'Dp_mean', 'Pred_log10K', 'Pred_Permeability'];
    var lines = [headers.join(',')];
    
    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        lines.push([r.porosity, r.particle_ratio, r.Df_mean, r.Dp_mean, r.Pred_log10K, r.Pred_Permeability].join(','));
    }
    
    var csv = lines.join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'permeability_results.csv';
    a.click();
    URL.revokeObjectURL(url);
    
    toast('Đã lưu file', 'success');
}

function setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn.classList.add('loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

function toast(msg, type) {
    if (!dom.toast) {
        alert(msg);
        return;
    }
    dom.toast.textContent = msg;
    dom.toast.className = 'toast visible ' + (type || '');
    setTimeout(function() {
        dom.toast.classList.remove('visible');
    }, 3000);
}
