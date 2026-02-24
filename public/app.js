// NFC Reading Module - Event-based continuous scanning
const nfcReader = {
    controller: null,
    reader: null,

    async start(onRead, onError) {
        if (this.controller) return; // Already scanning

        try {
            this.controller = new AbortController();
            this.reader = new NDEFReader();

            await this.reader.scan({ signal: this.controller.signal });

            this.reader.addEventListener('reading', ({ message, serialNumber }) => {
                onRead(message, serialNumber);
            });

            this.reader.addEventListener('readingerror', () => {
                onError('Error reading NFC tag');
            });

        } catch (error) {
            if (error.name !== 'AbortError') {
                onError(error.message);
            }
            this.controller = null;
            this.reader = null;
        }
    },

    stop() {
        if (this.controller) {
            this.controller.abort();
            this.controller = null;
            this.reader = null;
        }
    },

    isScanning() {
        return this.controller !== null;
    }
};

// NFC Writing Module - Promise-based single write operation
const nfcWriter = {
    controller: null,

    async write(records, onProgress) {
        if (this.controller) {
            throw new Error('Write operation already in progress');
        }

        const writer = new NDEFReader();
        this.controller = new AbortController();

        try {
            if (onProgress) onProgress('reading');
            if (onProgress) onProgress('writing');
            await writer.write({ records, signal: this.controller.signal });
            if (onProgress) onProgress('success');
            this.controller = null;
            return true;
        } catch (error) {
            this.controller = null;
            if (onProgress) onProgress('error', error);
            throw error;
        }
    },

    cancel() {
        if (this.controller) {
            this.controller.abort();
            this.controller = null;
        }
    },

    isWriting() {
        return this.controller !== null;
    }
};

// Main Application
const app = {
    nfcSupported: false,

    materialPresets: {
        'PLA': { minTemp: 190, maxTemp: 220, bedTempMin: 50, bedTempMax: 60 },
        'PETG': { minTemp: 220, maxTemp: 250, bedTempMin: 70, bedTempMax: 80 },
        'ABS': { minTemp: 230, maxTemp: 260, bedTempMin: 90, bedTempMax: 110 },
        'ASA': { minTemp: 240, maxTemp: 270, bedTempMin: 90, bedTempMax: 110 },
        'TPU': { minTemp: 210, maxTemp: 230, bedTempMin: 30, bedTempMax: 60 },
        'PA': { minTemp: 240, maxTemp: 270, bedTempMin: 70, bedTempMax: 90 },
        'PA12': { minTemp: 240, maxTemp: 270, bedTempMin: 70, bedTempMax: 90 },
        'PC': { minTemp: 270, maxTemp: 310, bedTempMin: 100, bedTempMax: 120 },
        'PEEK': { minTemp: 360, maxTemp: 400, bedTempMin: 120, bedTempMax: 150 },
        'PVA': { minTemp: 190, maxTemp: 220, bedTempMin: 50, bedTempMax: 60 },
        'HIPS': { minTemp: 230, maxTemp: 250, bedTempMin: 90, bedTempMax: 110 },
        'PCTG': { minTemp: 220, maxTemp: 250, bedTempMin: 70, bedTempMax: 80 },
        'PLA-CF': { minTemp: 190, maxTemp: 220, bedTempMin: 50, bedTempMax: 60 },
        'PETG-CF': { minTemp: 230, maxTemp: 260, bedTempMin: 70, bedTempMax: 80 },
        'PA-CF': { minTemp: 250, maxTemp: 280, bedTempMin: 70, bedTempMax: 90 }
    },

    palettes: {
        material: {
            paletteId: 'materialPalette',
            inputId: 'materialType',
            items: () => Object.keys(app.materialPresets),
            defaultValue: 'PLA',
            onSelect() { app.applyTemperaturePreset(); app.updateVisibility(); },
        },
        brand: {
            paletteId: 'brandPalette',
            inputId: 'brandValue',
            items: ['Generic', 'Bambu Lab', 'Hatchbox', 'eSun', 'Overture', 'SUNLU', 'Polymaker', 'Prusament', 'Snapmaker', 'Jayo'],
            defaultValue: 'Generic',
            customInputId: 'brandInput',
        },
        variant: {
            paletteId: 'variantPalette',
            inputId: 'extendedSubType',
            items: [{label: 'None', value: ''}, 'Basic', 'Matte', 'SnapSpeed', 'Silk', 'Support', 'HF', '95A', '95A HF'],
            defaultValue: '',
        },
    },

    init() {
        this.checkNFC();
        // Removed preset swatch palette; using canvas pickers only
        if (typeof ColorPicker !== 'undefined' && ColorPicker && typeof ColorPicker.init === 'function') {
            ColorPicker.init(this);
        }
        for (const name in this.palettes) this.initPalette(name);
        this.populateFormats();
        this.initEventListeners();
        this.updateFormat();
        this.updateVisibility();
        // Initialize all four colors
        for (let i = 1; i <= 4; i++) {
            this.updateColor('#FFFFFF', i);
        }
        this.applyTemperaturePreset();
        this.updateRecordSize();
    },

    populateFormats(withHidden = false, selectedId = 0) {
        const select = document.getElementById('formatSelect');
        if (!select) return;
        // Clear existing options
        while (select.firstChild) select.removeChild(select.firstChild);

        const list = formats.availableFormats(withHidden);
        list.forEach((f, idx) => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.label;
            if (selectedId ? f.id === selectedId : idx === 0) opt.selected = true;
            select.appendChild(opt);
        });
    },

    async checkNFC() {
        if ('NDEFReader' in window) {
            try {
                await navigator.permissions.query({ name: "nfc" });
                this.nfcSupported = true;
                this.updateNFCStatus(true, 'NFC is ready');
            } catch {
                this.nfcSupported = true;
                this.updateNFCStatus(true, 'NFC available');
            }
            document.getElementById('scanBtn').disabled = false;
            document.getElementById('writeBtn').disabled = false;
        } else {
            this.updateNFCStatus(false, 'NFC not supported on this device');
        }
    },

    updateNFCStatus(ready, message) {
        const indicator = document.getElementById('nfcIndicator');
        const text = document.getElementById('nfcStatusText');
        indicator.classList.toggle('ready', ready);
        text.textContent = message;
    },

    setMode(mode) {
        // Always stop scanning when changing modes
        this.stopScanning();

        // Hide all sections
        document.getElementById('modeSelection').classList.add('hidden');
        document.getElementById('readSection').classList.add('hidden');
        document.getElementById('formSection').classList.add('hidden');

        const formatSelect = document.getElementById('formatSelect');

        if (mode === 'menu') {
            document.getElementById('modeSelection').classList.remove('hidden');
        } else if (mode === 'read') {
            document.getElementById('readSection').classList.remove('hidden');
            this.clearReadData();
            this.startScanning();
        } else if (mode === 'update') {
            document.getElementById('formSection').classList.remove('hidden');
            document.getElementById('formTitle').textContent = 'Update Tag Data';
            // Keep current selection while repopulating formats
            const current = formatSelect.value;
            this.populateFormats(true, current);
        } else if (mode === 'create') {
            document.getElementById('formSection').classList.remove('hidden');
            document.getElementById('formTitle').textContent = 'Create New Tag';
            // Repopulate formats and select openspool_extended by default
            this.populateFormats(false);
            // Reset all fields to defaults
            this.populateForm({ format: 'openspool_extended' });
            // Generate new lot number for new tags
            this.randomizeLotNr();
        }

        // Toggle floating write button visibility (only in create/update)
        const floatBtn = document.getElementById('floatingWriteBtn');
        if (floatBtn) {
            const show = (mode === 'create' || mode === 'update');
            floatBtn.classList.toggle('hidden', !show);
        }
    },

    clearReadData() {
        document.getElementById('fileInput').value = '';
        document.getElementById('decodedData').textContent = '';
        document.getElementById('decodedDataContainer').classList.add('hidden');
        this.showStatus('readStatus', '', '');
    },

    toggleScan() {
        if (nfcReader.isScanning()) {
            this.stopScanning();
        } else {
            this.startScanning();
        }
    },

    startScanning() {
        if (!this.nfcSupported) {
            this.showStatus('readStatus', 'error', 'NFC not supported');
            return;
        }

        this.showStatus('readStatus', 'warning', 'Hold device near NFC tag...');

        nfcReader.start(
            (message, serialNumber) => this.handleTagRead(message, serialNumber),
            (errorMsg) => this.handleScanError(errorMsg)
        );

        document.getElementById('scanBtn').textContent = 'Stop Scanning';
        document.getElementById('scanBtn').classList.remove('btn-success');
        document.getElementById('scanBtn').classList.add('btn-secondary');
    },

    stopScanning() {
        nfcReader.stop();
        document.getElementById('scanBtn').textContent = 'Start Scanning';
        document.getElementById('scanBtn').classList.remove('btn-secondary');
        document.getElementById('scanBtn').classList.add('btn-success');
        this.showStatus('readStatus', '', '');
    },

    handleScanError(errorMsg) {
        this.stopScanning();
        this.showStatus('readStatus', 'error', errorMsg);
    },

    handleTagRead(message, serialNumber) {
        let output = `Serial: ${serialNumber}\n\n`;
        let result = null;

        for (const record of message.records) {
            result = formats.parseNDEFRecord(record);
            if (result) {
                output += `Format: ${formats.getDisplayName(result.format)}\n`;
                output += `Material: ${result.data.materialType}\n`;
                output += `Brand: ${result.data.brand}\n`;
                output += `Color: #${result.data.colorHex}\n`;
                break;
            }
        }

        if (result) {
            this.showDecodedData(output);
            this.populateForm(result.data, result.format);
            this.showStatus('readStatus', 'success', 'Tag read successfully! Ready for next tag...');
            this.showStatus('writeStatus', 'success', `Data loaded (${result.format})`);
            // Switch to update mode - keeps scanning active
            this.setMode('update');
        } else {
            this.showDecodedData(output + '\nNo valid data found');
            this.showStatus('readStatus', 'warning', 'No recognized format found. Keep scanning...');
        }
    },

    showDecodedData(text) {
        document.getElementById('decodedData').textContent = text;
        document.getElementById('decodedDataContainer').classList.remove('hidden');
    },

    initEventListeners() {
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0]);
        });

        document.getElementById('importFile').addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0]);
            e.target.value = ''; // Reset
        });

        // Add event listeners for all four color inputs
        for (let i = 1; i <= 4; i++) {
            document.getElementById(`colorHex${i}`).addEventListener('input', (e) => {
                this.updateColor('#' + e.target.value, i);
                this.updateRecordSize();
            });
        }

        document.getElementById('materialType').addEventListener('change', () => {
            this.applyTemperaturePreset();
            this.updateVisibility();
        });

        document.getElementById('showAdditionalColors').addEventListener('change', (e) => {
            this.toggleAdditionalColors(e.target.checked);
        });

        document.getElementById('brandInput').addEventListener('input', () => {
            document.getElementById('brandValue').value = document.getElementById('brandInput').value || '';
            this.updateRecordSize();
        });

        // Add listeners to all input fields to update record size
        const inputFields = ['minTemp', 'maxTemp', 'bedTempMin', 'bedTempMax',
                            'spoolmanId', 'lotNr',
                            'materialName', 'gtin', 'materialAbbr', 'density',
                            'diameter', 'preheatTemp', 'mfgDate', 'nominalWeight',
                            'actualWeight', 'spoolWeight', 'countryCode'];

        inputFields.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => this.updateRecordSize());
            }
        });

        document.getElementById('matteFinish').addEventListener('change', () => {
            this.updateRecordSize();
        });
    },

    handleFileUpload(file) {
        if (!file) return;

        nfcReader.stop();

        // Determine context for error reporting
        const isFormVisible = !document.getElementById('formSection').classList.contains('hidden');
        const statusId = isFormVisible ? 'writeStatus' : 'readStatus';

        const format = formats.detectFormatFromFilename(file.name);
        if (!format) {
            this.showStatus(statusId, 'error', 'Unsupported file type');
            return;
        }

        let output = `File: ${file.name}\n\n`;
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = formats.parseData(format, e.target.result);
                this.populateForm(data, format);
                
                output += `Format: ${formats.getDisplayName(format)}\n`;
                output += `Material: ${data.materialType}\n`;
                
                if (!isFormVisible) {
                    this.showDecodedData(output);
                    this.transitionToForm(format);
                } else {
                    // Just update UI if already in form mode
                    this.showStatus(statusId, 'success', `Loaded ${formats.getDisplayName(format)}`);
                }
            } catch (err) {
                this.showStatus(statusId, 'error', `Invalid ${format} file`);
            }
        };

        reader.readAsArrayBuffer(file);
    },

    transitionToForm(format) {
        this.showStatus('writeStatus', 'success', `File loaded (${format})`);
        this.setMode('update');
    },

    populateForm(data, format) {
        document.getElementById('formatSelect').value = data.format || format;
        this.setPaletteValue('material', data.materialType || 'PLA');

        // Populate all four color fields
        document.getElementById('colorHex1').value = data.colorHex || 'FFFFFF';
        this.updateColor('#' + (data.colorHex || 'FFFFFF'), 1);

        document.getElementById('colorHex2').value = data.colorHex2 || 'FFFFFF';
        this.updateColor('#' + (data.colorHex2 || 'FFFFFF'), 2);

        document.getElementById('colorHex3').value = data.colorHex3 || 'FFFFFF';
        this.updateColor('#' + (data.colorHex3 || 'FFFFFF'), 3);

        document.getElementById('colorHex4').value = data.colorHex4 || 'FFFFFF';
        this.updateColor('#' + (data.colorHex4 || 'FFFFFF'), 4);

        // Show additional colors if any are present
        const hasAdditionalColors = (data.colorHex2 && data.colorHex2 !== 'FFFFFF') ||
                                     (data.colorHex3 && data.colorHex3 !== 'FFFFFF') ||
                                     (data.colorHex4 && data.colorHex4 !== 'FFFFFF');
        document.getElementById('showAdditionalColors').checked = hasAdditionalColors;
        this.toggleAdditionalColors(hasAdditionalColors);

        if (data.brand && this.palettes.brand.items.includes(data.brand)) {
            this.setPaletteValue('brand', data.brand);
        } else if (data.brand) {
            document.getElementById('brandInput').value = data.brand;
            this.setPaletteValue('brand', 'custom');
        } else {
            this.setPaletteValue('brand', 'Generic');
        }

        document.getElementById('minTemp').value = data.minTemp || '';
        document.getElementById('maxTemp').value = data.maxTemp || '';
        document.getElementById('bedTempMin').value = data.bedTempMin || '';
        document.getElementById('bedTempMax').value = data.bedTempMax || '';
        document.getElementById('spoolmanId').value = data.spoolmanId || '';
        document.getElementById('lotNr').value = data.lotNr || '';
        this.setPaletteValue('variant', data.extendedSubType ?? '');

        // Advanced fields
        document.getElementById('materialName').value = data.materialName || '';
        document.getElementById('gtin').value = data.gtin || '';
        document.getElementById('materialAbbr').value = data.materialAbbreviation || '';
        document.getElementById('density').value = data.density || '';
        document.getElementById('diameter').value = data.filamentDiameter || '1.75';
        document.getElementById('preheatTemp').value = data.preheatTemp || '';
        document.getElementById('mfgDate').value = data.manufacturedDate || '';
        document.getElementById('nominalWeight').value = data.nominalWeight || '';
        document.getElementById('actualWeight').value = data.actualWeight || '';
        document.getElementById('spoolWeight').value = data.emptySpoolWeight || '';
        document.getElementById('countryCode').value = data.countryOfOrigin || '';
        document.getElementById('matteFinish').checked = data.matteFinish || false;
        document.getElementById('silkFinish').checked = data.silkFinish || false;
        document.getElementById('translucent').checked = data.translucent || false;
        document.getElementById('transparent').checked = data.transparent || false;
        document.getElementById('glitter').checked = data.glitter || false;
        document.getElementById('gradualColorChange').checked = data.gradualColorChange || false;
        document.getElementById('coextruded').checked = data.coextruded || false;

        this.updateFormat();
        this.updateVisibility();
        this.updateRecordSize();
    },

    getFormData() {
        const brandHidden = document.getElementById('brandValue');
        const brandInput = document.getElementById('brandInput');
        const brand = brandHidden.value || brandInput.value || 'Generic';

        const data = {
            format: document.getElementById('formatSelect').value,

            // Core/common
            materialType: document.getElementById('materialType').value,
            brand: brand || 'Generic',
            colorHex: document.getElementById('colorHex1').value.replace('#', ''),
            colorHex2: document.getElementById('colorHex2').value.replace('#', ''),
            colorHex3: document.getElementById('colorHex3').value.replace('#', ''),
            colorHex4: document.getElementById('colorHex4').value.replace('#', ''),

            // Temps/IDs
            minTemp: document.getElementById('minTemp').value,
            maxTemp: document.getElementById('maxTemp').value,
            bedTempMin: document.getElementById('bedTempMin').value,
            bedTempMax: document.getElementById('bedTempMax').value,
            spoolmanId: document.getElementById('spoolmanId').value,
            lotNr: document.getElementById('lotNr').value,
            extendedSubType: document.getElementById('extendedSubType').value,

            // Advanced
            materialName: document.getElementById('materialName').value,
            gtin: document.getElementById('gtin').value,
            materialAbbreviation: document.getElementById('materialAbbr').value,
            density: document.getElementById('density').value,
            filamentDiameter: document.getElementById('diameter').value,
            preheatTemp: document.getElementById('preheatTemp').value,
            manufacturedDate: document.getElementById('mfgDate').value,
            nominalWeight: document.getElementById('nominalWeight').value,
            actualWeight: document.getElementById('actualWeight').value,
            emptySpoolWeight: document.getElementById('spoolWeight').value,
            countryOfOrigin: document.getElementById('countryCode').value,

            // Visual/material tags
            matteFinish: document.getElementById('matteFinish').checked,
            silkFinish: document.getElementById('silkFinish').checked,
            translucent: document.getElementById('translucent').checked,
            transparent: document.getElementById('transparent').checked,
            glitter: document.getElementById('glitter').checked,
            gradualColorChange: document.getElementById('gradualColorChange').checked,
            coextruded: document.getElementById('coextruded').checked
        };

        const currentFormat = document.getElementById('formatSelect').value;

        // Filter returned data by availableFields for the selected format
        const available = formats.availableFields(currentFormat, data);
        if (available && available.size) {
            const filtered = {};
            Object.keys(data).forEach(k => {
                if (available.has(k)) filtered[k] = data[k];
            });
            return filtered;
        }
        return data;
    },

    downloadFile() {
        const format = document.getElementById('formatSelect').value;
        const formData = this.getFormData();

        const data = formats.generateData(format, formData);
        formats.download(format, data);

        this.showStatus('writeStatus', 'success', `${formats.getDisplayName(format)} file downloaded`);
    },

    handleWriteProgress(writeBtn, originalText, format) {
        const floatBtn = document.getElementById('floatingWriteBtn');
        const floatingOriginal = floatBtn ? floatBtn.textContent : '📝 Write NFC';
        return (status, error) => {
            writeBtn.disabled = false;
            if (floatBtn) floatBtn.disabled = false;
            if (status === 'reading') {
                writeBtn.textContent = '❌ Cancel';
                writeBtn.classList.remove('btn-success');
                writeBtn.classList.add('btn-secondary');
                if (floatBtn) floatBtn.textContent = '❌ Cancel';
                this.showStatus('writeStatus', 'warning', 'Hold device near NFC tag...');
            } else if (status === 'writing') {
                writeBtn.disabled = true;
                writeBtn.textContent = '⏳ Writing...';
                if (floatBtn) {
                    floatBtn.disabled = true;
                    floatBtn.textContent = '⏳ Writing...';
                }
                this.showStatus('writeStatus', 'warning', 'Writing to tag...');
            } else if (status === 'success') {
                writeBtn.textContent = originalText;
                writeBtn.classList.remove('btn-secondary');
                writeBtn.classList.add('btn-success');
                if (floatBtn) {
                    floatBtn.disabled = false;
                    floatBtn.textContent = floatingOriginal;
                }
                this.showStatus('writeStatus', 'success', `Tag written successfully (${format})`);
                if (typeof this.showMobileToast === 'function') this.showMobileToast('Tag written successfully', 'success');
            } else if (status === 'error') {
                writeBtn.textContent = originalText;
                writeBtn.classList.remove('btn-secondary');
                writeBtn.classList.add('btn-success');
                if (floatBtn) {
                    floatBtn.disabled = false;
                    floatBtn.textContent = floatingOriginal;
                }

                const errorMsg = error && error.name === 'NotAllowedError' ? 'NFC permission denied' :
                               error && error.name === 'AbortError' ? 'Write cancelled' :
                               (error && error.message) || 'Write failed';
                this.showStatus('writeStatus', 'error', errorMsg);
                if (typeof this.showMobileToast === 'function') this.showMobileToast(errorMsg, 'error');
            }
        };
    },

    toggleWrite() {
        if (nfcWriter.isWriting()) {
            this.cancelWrite();
        } else {
            this.writeNFC();
        }
    },

    cancelWrite() {
        nfcWriter.cancel();
        const writeBtn = document.getElementById('writeBtn');
        writeBtn.textContent = '📝 Write to NFC';
        writeBtn.classList.remove('btn-secondary');
        writeBtn.classList.add('btn-success');
        this.showStatus('writeStatus', '', '');
        const floatBtn = document.getElementById('floatingWriteBtn');
        if (floatBtn) {
            floatBtn.disabled = false;
            floatBtn.textContent = '📝 Write NFC';
        }
    },

    async writeNFC() {
        if (!this.nfcSupported) {
            this.showStatus('writeStatus', 'error', 'NFC not supported');
            return;
        }

        const writeBtn = document.getElementById('writeBtn');
        const originalText = writeBtn.textContent;
        const format = document.getElementById('formatSelect').value;
        const formData = this.getFormData();

        // Generate data and create NDEF records
        const data = formats.generateData(format, formData);
        const records = formats.createNDEFRecord(format, data);

        // Write using nfcWriter module with progress callback
        try {
            await nfcWriter.write(records, this.handleWriteProgress(writeBtn, originalText, format));
        } catch (error) {
            // Fallback error handling (shouldn't reach here normally)
            writeBtn.textContent = originalText;
            writeBtn.classList.remove('btn-secondary');
            writeBtn.classList.add('btn-success');
            this.showStatus('writeStatus', 'error', error.message);
        }
    },

    updateFormat() {
        this.updateRecordSize();
        this.updateVisibility();
    },

    // Toggle visibility of fields based on availableFields for current format
    updateVisibility() {
        const format = document.getElementById('formatSelect').value;
        const formData = this.getFormData();
        const available = formats.availableFields(format, formData);

        // Process all keys present in the DOM with data-field
        document.querySelectorAll('[data-field]')
            .forEach(el => {
                const key = el.getAttribute('data-field');
                if (!available || available.has(key)) {
                    el.classList.remove('hidden');
                } else {
                    el.classList.add('hidden');
                }
            });

        // Show/hide the Advanced section automatically: if any [data-field] inside it is available
        const advancedSection = document.getElementById('advancedSection');
        if (advancedSection) {
            const advancedFields = Array.from(advancedSection.querySelectorAll('[data-field]'))
                .map(el => el.getAttribute('data-field'));
            const hasAdvanced = !!(available && advancedFields.some(k => available.has(k)));
            advancedSection.classList.toggle('hidden', !hasAdvanced);
        }
    },

    applyTemperaturePreset() {
        const materialType = document.getElementById('materialType').value;
        const preset = this.materialPresets[materialType];

        if (preset) {
            document.getElementById('minTemp').value = preset.minTemp;
            document.getElementById('maxTemp').value = preset.maxTemp;
            document.getElementById('bedTempMin').value = preset.bedTempMin;
            document.getElementById('bedTempMax').value = preset.bedTempMax;
        }
        this.updateRecordSize();
    },

    updateRecordSize() {
        try {
            const format = document.getElementById('formatSelect').value;
            const formData = this.getFormData();
            const size = formats.calculateRecordSize(format, formData);

            // Update color based on tag capacity
            // NTAG213: 144 bytes, NTAG215: 504 bytes, NTAG216: 888 bytes
            const sizeInfo = document.getElementById('recordSizeInfo');
            let tagType = '';
            let colorStyle = '';

            if (size > 888) {
                // Too large for any tag
                colorStyle = 'rgba(244, 67, 54, 0.2)';
                sizeInfo.style.borderColor = 'var(--error)';
                tagType = 'Too large for any supported tag';
            } else if (size > 504) {
                // Requires NTAG216
                colorStyle = 'rgba(255, 152, 0, 0.2)';
                sizeInfo.style.borderColor = 'var(--warning)';
                tagType = 'NTAG216 required';
            } else if (size > 144) {
                // Requires NTAG215 or 216
                colorStyle = 'rgba(76, 175, 80, 0.1)';
                sizeInfo.style.borderColor = 'var(--success)';
                tagType = 'NTAG215/216';
            } else {
                // Fits on any tag
                colorStyle = 'rgba(76, 175, 80, 0.1)';
                sizeInfo.style.borderColor = 'var(--success)';
                tagType = 'NTAG213/215/216';
            }

            sizeInfo.style.background = colorStyle;
            document.getElementById('recordSize').textContent = `${size} bytes (${tagType})`;

            // Show Orca profile name for openspool_extended (Snapmaker U1 Extended)
            const orcaProfileInfo = document.getElementById('orcaProfileInfo');
            const orcaProfileName = document.getElementById('orcaProfileName');

            if (format === 'openspool_extended') {
                const brand = formData.brand || 'Generic';
                const material = formData.materialType || 'PLA';
                const subtype = formData.extendedSubType ?? '';
                const profileName = `${brand} ${material} ${subtype}`.trim();

                orcaProfileName.textContent = profileName;
                orcaProfileInfo.classList.remove('hidden');
            } else {
                orcaProfileInfo.classList.add('hidden');
            }
        } catch (e) {
            // Silently fail if form is incomplete
        }
    },

    toggleAdvanced() {
        const collapsible = document.querySelector('.collapsible');
        const content = document.querySelector('.collapsible-content');
        collapsible.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
    },

    copyOrcaProfile() {
        const profileName = document.getElementById('orcaProfileName').textContent;
        if (profileName && profileName !== '-') {
            navigator.clipboard.writeText(profileName).then(() => {
                this.showStatus('writeStatus', 'success', 'Profile name copied to clipboard!');
            }).catch(() => {
                this.showStatus('writeStatus', 'error', 'Failed to copy to clipboard');
            });
        }
    },

    // Color swatch palette removed in favor of canvas picker

    initPalette(name) {
        const config = this.palettes[name];
        const palette = document.getElementById(config.paletteId);
        if (!palette) return;
        palette.innerHTML = '';
        const items = typeof config.items === 'function' ? config.items() : config.items;
        const select = (val) => this.setPaletteValue(name, val);
        items.forEach(item => {
            if (typeof item === 'object') {
                palette.appendChild(this._createSwatch(item.label, item.value, select));
            } else {
                palette.appendChild(this._createSwatch(item, item, select));
            }
        });
        if (config.customInputId) {
            palette.appendChild(this._createSwatch('Custom', 'custom', select));
        }
        const inputEl = document.getElementById(config.inputId);
        select(inputEl.value !== '' ? inputEl.value : (config.defaultValue ?? ''));
    },

    _createSwatch(label, value, onSelect) {
        const box = document.createElement('div');
        box.className = 'material-swatch';
        box.textContent = label;
        box.dataset.value = value;
        box.setAttribute('role', 'button');
        box.setAttribute('tabindex', '0');
        box.title = `Select ${value}`;
        box.onclick = () => onSelect(value);
        box.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(value);
            }
        };
        return box;
    },

    setPaletteValue(name, value) {
        const config = this.palettes[name];
        const input = document.getElementById(config.inputId);
        const isCustom = config.customInputId && value === 'custom';
        if (config.customInputId) {
            const customInput = document.getElementById(config.customInputId);
            if (isCustom) {
                customInput.classList.remove('hidden');
                customInput.focus();
                input.value = customInput.value || '';
            } else {
                input.value = value;
                customInput.classList.add('hidden');
            }
        } else {
            input.value = value;
        }
        document.querySelectorAll(`#${config.paletteId} .material-swatch`).forEach(el => {
            const isSelected = isCustom ? el.dataset.value === 'custom' : el.dataset.value === value;
            el.classList.toggle('selected', isSelected);
            el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
        if (config.onSelect) config.onSelect(value);
        this.updateRecordSize();
    },

    updateColor(color, paletteId) {
        // Update color preview for specific palette
        const preview = document.getElementById(`colorPreview${paletteId}`);
        if (preview) {
            preview.style.background = color;
        }
        // Update canvas picker markers if available
        if (typeof ColorPicker !== 'undefined' && ColorPicker && typeof ColorPicker.setFromHex === 'function') {
            ColorPicker.setFromHex(paletteId, color);
        }
    },

    // Mobile toast helper (visible only under mobile media query)
    _toastTimer: null,
    showMobileToast(message, type) {
        const el = document.getElementById('mobileToast');
        if (!el) return;
        el.textContent = message;
        el.className = `mobile-toast show ${type || ''}`.trim();
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            el.classList.remove('show');
        }, 3500);
    },

    rgbToHex(rgb) {
        const result = rgb.match(/\d+/g);
        if (!result) return rgb;
        return '#' + result.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    },

    toggleAdditionalColors(show) {
        const additionalColorFields = document.querySelectorAll('.additional-colors');
        additionalColorFields.forEach(field => {
            field.style.display = show ? 'block' : 'none';
        });
    },

    showStatus(id, type, message) {
        const element = document.getElementById(id);
        element.className = `status-message ${type ? 'show ' + type : ''}`;
        element.textContent = message;
        if (type === 'success') {
            setTimeout(() => element.classList.remove('show'), 5000);
        }
    },

    randomizeLotNr() {
        const lotNr = Array.from({length: 8}, () =>
            Math.floor(Math.random() * 16).toString(16).toUpperCase()
        ).join('');
        document.getElementById('lotNr').value = lotNr;
        this.updateRecordSize();
    }
};

// Initialize app
app.init();
