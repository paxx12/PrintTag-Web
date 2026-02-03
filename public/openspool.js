// OpenSpool format handler
// Simple JSON-based format for 3D printing filament tags

const OpenSpool = {
    // Generate OpenSpool JSON data
    generateData: function(formData) {
        const data = {
            protocol: "openspool",
            version: "1.0",
            type: formData.materialType,
            color_hex: formData.colorHex.replace('#', '').toUpperCase(),
        };

        if (formData.brand) {
            data.brand = formData.brand;
        }
        if (formData.minTemp) {
            data.min_temp = formData.minTemp;
        }
        if (formData.maxTemp) {
            data.max_temp = formData.maxTemp;
        }
        if (formData.bedTempMin) {
            data.bed_min_temp = formData.bedTempMin;
        }
        if (formData.bedTempMax) {
            data.bed_max_temp = formData.bedTempMax;
        }
        if (formData.spoolmanId && parseInt(formData.spoolmanId) !== 0) {
            data.spool_id = parseInt(formData.spoolmanId);
        }
        if (formData.lotNr) {
            data.lot_nr = formData.lotNr.toUpperCase();
        }

        return data;
    },

    // Parse OpenSpool data
    parseData: function(jsonData) {
        if (jsonData.protocol !== "openspool") {
            throw new Error("Not an OpenSpool format");
        }

        return {
            materialType: jsonData.type || 'PLA',
            colorHex: jsonData.color_hex || 'FFFFFF',
            brand: jsonData.brand || 'Generic',
            minTemp: jsonData.min_temp || '220',
            maxTemp: jsonData.max_temp || '240',
            bedTempMin: jsonData.bed_min_temp || '',
            bedTempMax: jsonData.bed_max_temp || '',
            spoolmanId: jsonData.spool_id || 0,
            lotNr: jsonData.lot_nr || ''
        };
    },

    // Create NDEF record for NFC writing
    createNDEFRecord: function(data) {
        const jsonStr = JSON.stringify(data);
        const encoder = new TextEncoder();
        return [{
            recordType: "mime",
            mediaType: "application/json",
            data: encoder.encode(jsonStr)
        }];
    },

    // Parse NDEF record from NFC reading
    parseNDEFRecord: function(record) {
        if (record.recordType !== "mime" || record.mediaType !== "application/json") {
            return null;
        }

        const textDecoder = new TextDecoder();
        const text = textDecoder.decode(record.data);

        try {
            const jsonData = JSON.parse(text);
            if (jsonData.protocol === "openspool") {
                return this.parseData(jsonData);
            }
        } catch (e) {
            return null;
        }

        return null;
    },

    // Download as JSON file
    downloadJSON: function(data, filename = 'openspool.json') {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // Read from text or binary buffer
    readBinary: function(buffer) {
        try {
            const text = typeof buffer === 'string' ? buffer : new TextDecoder().decode(buffer);
            const jsonData = JSON.parse(text);
            return this.parseData(jsonData);
        } catch (e) {
            console.error('Error reading OpenSpool JSON:', e);
            return null;
        }
    }
};
