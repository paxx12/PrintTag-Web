// OpenPrintTag format handler
// CBOR-based format for 3D printing filament tags

const OpenPrintTag = {
    // Material type enum (material_type_enum.yaml in the OpenPrintTag spec,
    // https://github.com/OpenPrintTag/openprinttag-specification). Keys are the
    // spec's numbers; fibre-filled variants such as PLA-CF are the base type
    // plus a tag (see FILL_TAGS), as the spec describes them.
    MATERIAL_TYPES: {
        'pla': 0, 'petg': 1, 'tpu': 2, 'abs': 3, 'asa': 4, 'pc': 5, 'pctg': 6,
        'pp': 7, 'pa6': 8, 'pa11': 9, 'pa12': 10, 'pa66': 11, 'cpe': 12,
        'tpe': 13, 'hips': 14, 'pha': 15, 'pet': 16, 'pei': 17, 'pbt': 18,
        'pvb': 19, 'pva': 20, 'pekk': 21, 'peek': 22, 'bvoh': 23, 'tpc': 24,
        'pps': 25, 'ppsu': 26, 'pvc': 27, 'peba': 28, 'pvdf': 29, 'ppa': 30,
        'pcl': 31, 'pes': 32, 'pmma': 33, 'pom': 34, 'ppe': 35, 'ps': 36,
        'psu': 37, 'tpi': 38, 'sbs': 39, 'obc': 40, 'eva': 41, 'pa612': 42
    },

    // "<base>-<suffix>" material names and the tag (tags_enum.yaml) they map to
    FILL_TAGS: {
        'cf': 31, // contains_carbon_fiber
        'gf': 34  // contains_glass_fiber
    },

    MATERIAL_CLASSES: {
        'fff_filament': 0
    },
    // Available fields for OpenPrintTag (complete list including advanced fields)
    availableFields: function(formData) {
        return new Set([
            // Core/common
            'materialType', 'brand',
            'colorHex', 'colorHex2', 'colorHex3', 'colorHex4',
            'minTemp', 'maxTemp', 'bedTempMin', 'bedTempMax',
            'spoolmanId', 'lotNr',

            // Advanced fields
            'materialName', 'gtin', 'materialAbbreviation', 'density',
            'filamentDiameter', 'preheatTemp', 'manufacturedDate',
            'nominalWeight', 'actualWeight', 'emptySpoolWeight', 'countryOfOrigin',

            // Visual/material tags
            'matteFinish', 'silkFinish', 'translucent', 'transparent',
            'glitter', 'gradualColorChange', 'coextruded'
        ]);
    },

    // Get file extension for downloads
    getFileExtension(format) {
        return '.bin';
    },

    // Parse color string to RGBA bytes
    parseColor: function(colorStr) {
        if (!colorStr) return null;

        if (colorStr.startsWith('#')) {
            const hex = colorStr.slice(1);
            if (hex.length === 6) {
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                return new Uint8Array([r, g, b, 255]);
            }
        }
        return null;
    },

    // Helper function to encode colorHex to RGBA bytes for OpenPrintTag
    encodeColorHex: function(colorHex) {
        if (!colorHex || colorHex === 'FFFFFF') return null;
        return this.parseColor('#' + colorHex);
    },

    // Helper function to decode RGBA bytes to colorHex string
    decodeColorBytes: function(colorBytes) {
        if (!colorBytes || !(colorBytes instanceof Uint8Array) || colorBytes.length < 3) {
            return null;
        }
        return Array.from(colorBytes.slice(0, 3))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('').toUpperCase();
    },

    // Generate OpenPrintTag CBOR data
    // "PLA-CF" -> { base: 'pla', suffix: 'cf' }; "PA12" -> { base: 'pa12', suffix: '' }
    splitMaterial: function(name) {
        const lower = (name || '').toLowerCase().trim();
        const dash = lower.lastIndexOf('-');
        if (dash > 0 && this.FILL_TAGS[lower.substring(dash + 1)] !== undefined) {
            return { base: lower.substring(0, dash), suffix: lower.substring(dash + 1) };
        }
        return { base: lower, suffix: '' };
    },

    generateData: function(formData) {
        const data = new Map();

        // Field 8: material_class (Required)
        data.set(8, this.MATERIAL_CLASSES['fff_filament']);

        // Field 9: material_type (Recommended). "PLA-CF" is written as
        // material_type PLA + tag contains_carbon_fiber. A type the spec has no
        // number for (e.g. generic "PA") is left out of field 9 and stored as
        // material_abbreviation instead, rather than as a wrong number.
        const material = this.splitMaterial(formData.materialType);
        const fillTag = material.suffix ? this.FILL_TAGS[material.suffix] : undefined;
        const typeKnown = this.MATERIAL_TYPES[material.base] !== undefined &&
            (!material.suffix || fillTag !== undefined);
        if (typeKnown) {
            data.set(9, this.MATERIAL_TYPES[material.base]);
        }

        // Field 10: material_name (Recommended)
        if (formData.materialName) {
            data.set(10, formData.materialName.substring(0, 31));
        }

        // Field 11: brand_name (Recommended)
        if (formData.brand) {
            data.set(11, formData.brand.substring(0, 31));
        }

        // Field 4: gtin (Recommended)
        if (formData.gtin) {
            const gtinNum = parseInt(formData.gtin);
            if (!isNaN(gtinNum)) {
                data.set(4, gtinNum);
            }
        }

        // Field 14: manufactured_date (Recommended, timestamp)
        if (formData.manufacturedDate) {
            const timestamp = Math.floor(new Date(formData.manufacturedDate).getTime() / 1000);
            data.set(14, timestamp);
        }

        // Field 16: nominal_netto_full_weight (Recommended, in grams)
        const nominalWeight = parseInt(formData.nominalWeight);
        if (!isNaN(nominalWeight) && nominalWeight > 0) {
            data.set(16, nominalWeight);
        }

        // Field 17: actual_netto_full_weight (Recommended, in grams)
        const actualWeight = parseInt(formData.actualWeight);
        if (!isNaN(actualWeight) && actualWeight > 0) {
            data.set(17, actualWeight);
        }

        // Field 18: empty_container_weight (Recommended, in grams)
        const emptySpoolWeight = parseInt(formData.emptySpoolWeight);
        if (!isNaN(emptySpoolWeight) && emptySpoolWeight > 0) {
            data.set(18, emptySpoolWeight);
        }

        // Field 19: primary_color (Recommended)
        const colorBytes = this.encodeColorHex(formData.colorHex);
        if (colorBytes) {
            data.set(19, colorBytes);
        }

        // Field 20: secondary_color (Optional)
        const colorBytes2 = this.encodeColorHex(formData.colorHex2);
        if (colorBytes2) {
            data.set(20, colorBytes2);
        }

        // Field 21: tertiary_color (Optional)
        const colorBytes3 = this.encodeColorHex(formData.colorHex3);
        if (colorBytes3) {
            data.set(21, colorBytes3);
        }

        // Field 22: quaternary_color (Optional)
        const colorBytes4 = this.encodeColorHex(formData.colorHex4);
        if (colorBytes4) {
            data.set(22, colorBytes4);
        }

        // Field 28: tags (array of tag enums)
        const tags = [];
        if (formData.matteFinish) {
            tags.push(16); // Matte
        }
        if (formData.silkFinish) {
            tags.push(17); // Silk
        }
        if (formData.translucent) {
            tags.push(19); // Translucent
        }
        if (formData.transparent) {
            tags.push(20); // Transparent
        }
        if (formData.glitter) {
            tags.push(23); // Glitter
        }
        if (formData.gradualColorChange) {
            tags.push(28); // Gradual Color Change
        }
        if (formData.coextruded) {
            tags.push(29); // Coextruded
        }
        if (typeKnown && fillTag !== undefined) {
            tags.push(fillTag); // e.g. contains_carbon_fiber for PLA-CF
        }
        if (tags.length > 0) {
            data.set(28, tags);
        }

        // Field 29: density (Recommended, g/cm³)
        const density = parseFloat(formData.density);
        if (!isNaN(density) && density > 0) {
            data.set(29, density);
        }

        // Field 30: filament_diameter (mm)
        const filamentDiameter = parseFloat(formData.filamentDiameter);
        if (!isNaN(filamentDiameter) && filamentDiameter > 0) {
            data.set(30, filamentDiameter);
        }

        // Field 34: min_print_temperature (Recommended)
        const minTemp = parseInt(formData.minTemp);
        if (!isNaN(minTemp) && minTemp > 0) {
            data.set(34, minTemp);
        }

        // Field 35: max_print_temperature (Recommended)
        const maxTemp = parseInt(formData.maxTemp);
        if (!isNaN(maxTemp) && maxTemp > 0) {
            data.set(35, maxTemp);
        }

        // Field 36: preheat_temperature (Recommended)
        const preheatTemp = parseInt(formData.preheatTemp);
        if (!isNaN(preheatTemp) && preheatTemp > 0) {
            data.set(36, preheatTemp);
        }

        // Field 37: min_bed_temperature (Recommended)
        const bedTempMin = parseInt(formData.bedTempMin);
        if (!isNaN(bedTempMin) && bedTempMin >= 0) {
            data.set(37, bedTempMin);
        }

        // Field 38: max_bed_temperature (Recommended)
        const bedTempMax = parseInt(formData.bedTempMax);
        if (!isNaN(bedTempMax) && bedTempMax > 0) {
            data.set(38, bedTempMax);
        }

        // Field 52: material_abbreviation (max 7 chars); falls back to the
        // material name when field 9 could not represent it
        const abbreviation = formData.materialAbbreviation ||
            (typeKnown ? '' : (formData.materialType || '').toUpperCase());
        if (abbreviation) {
            data.set(52, abbreviation.substring(0, 7));
        }

        // Field 55: country_of_origin (ISO 3166-1, 2 chars)
        if (formData.countryOfOrigin) {
            data.set(55, formData.countryOfOrigin.substring(0, 2).toUpperCase());
        }

        return this.encodeRegions(data);
    },

    // Parse OpenPrintTag CBOR data
    parseData: function(cborBytes) {
        const decoded = this.decodeRegions(cborBytes);
        const result = {
            materialType: 'PLA',
            colorHex: 'FFFFFF',
            brand: 'Generic',
            minTemp: '220',
            maxTemp: '240',
            materialName: '',
            gtin: '',
            materialAbbreviation: '',
            density: '',
            filamentDiameter: '1.75',
            preheatTemp: '',
            bedTempMin: '',
            bedTempMax: '',
            manufacturedDate: '',
            nominalWeight: '',
            actualWeight: '',
            emptySpoolWeight: '',
            countryOfOrigin: '',
            matteFinish: false
        };

        // Material type
        if (decoded.has(9)) {
            const typeValue = decoded.get(9);
            const typeKey = Object.keys(this.MATERIAL_TYPES).find(k => this.MATERIAL_TYPES[k] === typeValue);
            if (typeKey) {
                const tags = Array.isArray(decoded.get(28)) ? decoded.get(28) : [];
                const suffix = Object.keys(this.FILL_TAGS).find(k => tags.includes(this.FILL_TAGS[k]));
                result.materialType = (suffix ? `${typeKey}-${suffix}` : typeKey).toUpperCase();
            }
        } else if (decoded.has(52)) {
            result.materialType = String(decoded.get(52)).toUpperCase();
        }

        // Material name
        if (decoded.has(10)) {
            result.materialName = decoded.get(10);
        }

        // Brand
        if (decoded.has(11)) {
            result.brand = decoded.get(11);
        }

        // GTIN
        if (decoded.has(4)) {
            result.gtin = decoded.get(4).toString();
        }

        // Manufactured date
        if (decoded.has(14)) {
            const timestamp = decoded.get(14);
            const date = new Date(timestamp * 1000);
            result.manufacturedDate = date.toISOString().split('T')[0];
        }

        // Nominal weight
        if (decoded.has(16)) {
            result.nominalWeight = decoded.get(16).toString();
        }

        // Actual weight
        if (decoded.has(17)) {
            result.actualWeight = decoded.get(17).toString();
        }

        // Empty spool weight
        if (decoded.has(18)) {
            result.emptySpoolWeight = decoded.get(18).toString();
        }

        // Color (Field 19: primary_color)
        if (decoded.has(19)) {
            const colorHex = this.decodeColorBytes(decoded.get(19));
            if (colorHex) {
                result.colorHex = colorHex;
            }
        }

        // Secondary Color (Field 20)
        if (decoded.has(20)) {
            const colorHex2 = this.decodeColorBytes(decoded.get(20));
            if (colorHex2) {
                result.colorHex2 = colorHex2;
            }
        }

        // Tertiary Color (Field 21)
        if (decoded.has(21)) {
            const colorHex3 = this.decodeColorBytes(decoded.get(21));
            if (colorHex3) {
                result.colorHex3 = colorHex3;
            }
        }

        // Quaternary Color (Field 22)
        if (decoded.has(22)) {
            const colorHex4 = this.decodeColorBytes(decoded.get(22));
            if (colorHex4) {
                result.colorHex4 = colorHex4;
            }
        }

        // Tags
        if (decoded.has(28)) {
            const tags = decoded.get(28);
            if (Array.isArray(tags)) {
                result.matteFinish = tags.includes(16);
                result.silkFinish = tags.includes(17);
                result.translucent = tags.includes(19);
                result.transparent = tags.includes(20);
                result.glitter = tags.includes(23);
                result.gradualColorChange = tags.includes(28);
                result.coextruded = tags.includes(29);
            }
        }

        // Density
        if (decoded.has(29)) {
            result.density = decoded.get(29).toString();
        }

        // Filament diameter
        if (decoded.has(30)) {
            result.filamentDiameter = decoded.get(30).toString();
        }

        // Min temp
        if (decoded.has(34)) {
            result.minTemp = decoded.get(34).toString();
        }

        // Max temp
        if (decoded.has(35)) {
            result.maxTemp = decoded.get(35).toString();
        }

        // Preheat temp
        if (decoded.has(36)) {
            result.preheatTemp = decoded.get(36).toString();
        }

        // Bed temp min
        if (decoded.has(37)) {
            result.bedTempMin = decoded.get(37).toString();
        }

        // Bed temp max
        if (decoded.has(38)) {
            result.bedTempMax = decoded.get(38).toString();
        }

        // Material abbreviation
        if (decoded.has(52)) {
            result.materialAbbreviation = decoded.get(52);
        }

        // Country of origin
        if (decoded.has(55)) {
            result.countryOfOrigin = decoded.get(55);
        }

        return result;
    },

    // Create NDEF record for NFC writing
    createNDEFRecord: function(cborData) {
        return [{
            recordType: "mime",
            mediaType: "application/vnd.openprinttag",
            data: cborData
        }];
    },

    // Parse NDEF record from NFC reading
    parseNDEFRecord: function(record) {
        if (record.recordType !== "mime" || record.mediaType !== "application/vnd.openprinttag") {
            return null;
        }

        const cborBytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
        try {
            return this.parseData(cborBytes);
        } catch (e) {
            console.error('Error parsing OpenPrintTag:', e);
            return null;
        }
    },

    // Download as binary NDEF file
    download: function(cborData, filename = 'openprinttag.bin') {
        const ndefBytes = NDEF.serialize(cborData, 'application/vnd.openprinttag');
        const blob = new Blob([ndefBytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // Read binary data (NDEF or raw CBOR)
    readBinary: function(buffer) {
        try {
            // Try NDEF format first
            const cborData = NDEF.deserialize(buffer, 'application/vnd.openprinttag');
            if (cborData) {
                return this.parseData(cborData);
            }
            return null;
        } catch (e) {
            console.error('Error reading binary:', e);
            return null;
        }
    },

    // Decode OpenPrintTag regions (meta, main, aux)
    decodeRegions: function(bytes) {
        const meta = CBOR.decode(bytes);
        if (!(meta instanceof Map)) {
            throw new Error('Invalid CBOR data');
        }

        const mainRegionOffset = meta.has(0) ? meta.get(0) : meta.offset;
        const auxRegionOffset = meta.has(2) ? meta.get(2) : bytes.length;
        const mainRegionSize = meta.has(1) ? meta.get(1) : auxRegionOffset - mainRegionOffset;

        return CBOR.decode(bytes.slice(mainRegionOffset, mainRegionOffset + mainRegionSize));
    },

    encodeRegions: function(mainData) {
        const mainBytes = CBOR.encode(mainData);
        const meta = new Map();

        const metaBytes = CBOR.encode(meta);
        const combined = new Uint8Array(metaBytes.length + mainBytes.length);
        combined.set(metaBytes, 0);
        combined.set(mainBytes, metaBytes.length);
        return combined;
    },
};
