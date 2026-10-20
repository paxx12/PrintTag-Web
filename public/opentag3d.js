// OpenTag3D format handler
// Fixed binary memory map stored as an NDEF MIME record (application/opentag3d).
// Spec: https://opentag3d.info/spec.html (memory map from spec.json; 2.001-2.003 share it)

const OpenTag3D = {
    MIME_TYPE: 'application/opentag3d',

    // Tag Version written to new tags (3 implied decimals). 2.001 is the version
    // OpenRFID bundles; 2.002/2.003 kept the same memory map for every field
    // written here, and OpenRFID logs a warning on each scan of newer versions.
    VERSION: 2001,

    // Core memory map covers 0x00-0xDF
    PAYLOAD_LENGTH: 0xE0,

    // Field offsets and lengths from the official spec.json
    FIELDS: {
        tag_version:        [0x00, 2],
        material:           [0x02, 5],
        material_mod:       [0x07, 5],
        manufacturer:       [0x0C, 16],
        color_name:         [0x1C, 32],
        color_1:            [0x3C, 4],
        color_2:            [0x40, 4],
        color_3:            [0x44, 4],
        color_4:            [0x48, 4],
        serial:             [0x4C, 32],
        sku:                [0x6C, 16],
        barcode:            [0x7C, 6],
        mfg_date:           [0x84, 4],
        mfg_time:           [0x88, 3],
        diameter:           [0x8C, 2],  // µm
        tolerance:          [0x8E, 1],
        nozzle_diameter:    [0x8F, 1],
        print_temp:         [0x90, 1],  // °C / 5
        min_print_temp:     [0x91, 1],  // °C / 5
        max_print_temp:     [0x92, 1],  // °C / 5
        chamber_temp:       [0x93, 1],  // °C / 5
        bed_temp:           [0x94, 1],  // °C / 5
        min_bed_temp:       [0x95, 1],  // °C / 5
        max_bed_temp:       [0x96, 1],  // °C / 5
        target_vso:         [0x97, 1],
        min_vso:            [0x98, 1],
        max_vso:            [0x99, 1],
        max_dry_temp:       [0x9A, 1],  // °C / 5
        dry_time:           [0x9B, 1],  // hours
        density:            [0x9C, 2],  // µg/cm³ (g/cm³ x 1000)
        weight:             [0x9E, 2],  // g, nominal
        empty_spool_weight: [0xA0, 2],  // g
        measured_length:    [0xA2, 2],
        measured_weight:    [0xA4, 2],  // g
        spool_core_diameter:[0xA6, 1],
        td:                 [0xA7, 1],  // mm x 10
        mfi_temp:           [0xA8, 1],
        mfi_load:           [0xA9, 1],
        mfi_value:          [0xAA, 1],
        data_url:           [0xB8, 32]
    },

    // Modifiers that belong to the material name (PLA + CF -> PLA-CF)
    FIBER_MODIFIERS: ['CF', 'GF'],

    // Byte limits for typed text (field lengths in the memory map). Material
    // may also carry a -CF/-GF suffix, which is stored in the modifier field.
    TEXT_LIMITS: { brand: 16, material: 5, variant: 5, lotNr: 32 },

    // The lot number field holds the tag's Serial / Batch ID
    LOT_FIELD: { label: 'Serial / Batch ID', hint: 'Up to 32 characters', maxLength: 32 },

    availableFields: function(formData) {
        const fields = new Set([
            'materialType', 'brand', 'extendedSubType',
            'colorHex', 'colorHex2', 'colorHex3', 'colorHex4',
            'minTemp', 'maxTemp', 'bedTempMin', 'bedTempMax',
            'lotNr',

            // Advanced fields
            'gtin', 'density', 'filamentDiameter', 'manufacturedDate',
            'nominalWeight', 'actualWeight', 'emptySpoolWeight',

            // OpenTag3D-only fields
            'colorName', 'printTemp', 'bedTemp', 'chamberTemp',
            'dryTemp', 'dryTime', 'td',

            // Bytes of a loaded tag, so fields without a form input survive a rewrite
            'opentag3dBase'
        ]);

        // CF/GF materials use the only modifier field (PLA + CF), so there is
        // no room for a variant: hide it and don't write it
        if (formData && this.splitMaterial(formData.materialType || '').fiber) {
            fields.delete('extendedSubType');
        }
        return fields;
    },

    getFileExtension(format) {
        return '.bin';
    },

    // --- Encoding ---

    generateData: function(formData) {
        return this.encode(formData).bytes;
    },

    // Things that will change when written (truncation, 5 °C steps, defaults)
    getWarnings: function(formData) {
        return this.encode(formData).warnings;
    },

    encode: function(formData) {
        // Start from the loaded tag's bytes when updating a tag, so fields the
        // form doesn't cover (SKU, data URL, MFI, ...) are kept. Every field the
        // form does cover is written below, so it always matches the form.
        const bytes = new Uint8Array(this.PAYLOAD_LENGTH);
        const base = formData.opentag3dBase;
        if (base && base.length) bytes.set(base.slice(0, this.PAYLOAD_LENGTH));
        const baseVersion = base && base.length >= 2 ? (base[0] << 8) | base[1] : 0;
        const warnings = [];
        const F = this.FIELDS;
        const clear = (field) => bytes.fill(0, F[field][0], F[field][0] + F[field][1]);

        const int = (v) => {
            const n = parseInt(v, 10);
            return isNaN(n) ? null : n;
        };
        const num = (v) => {
            const n = parseFloat(v);
            return isNaN(n) ? null : n;
        };
        const putInt = (field, value) => {
            const [start, length] = F[field];
            const max = Math.pow(256, length) - 1;
            let v = Math.max(0, Math.min(max, Math.round(value || 0)));
            for (let i = length - 1; i >= 0; i--) {
                bytes[start + i] = v % 256;
                v = Math.floor(v / 256);
            }
        };
        const putString = (field, label, value) => {
            const [start, length] = F[field];
            clear(field);
            const { encoded, truncated } = this.truncateUtf8(value || '', length);
            bytes.set(encoded, start);
            if (truncated) {
                warnings.push(`${label} "${value}" will be shortened to "${new TextDecoder().decode(encoded)}" (${length} bytes max)`);
            }
        };
        const putColor = (field, hex) => {
            clear(field);
            const rgb = this.parseHex(hex);
            if (rgb) bytes.set([...rgb, 0xFF], F[field][0]);
        };
        // Temperatures are stored in 5 °C steps
        const putTemp = (field, label, celsius) => {
            clear(field);
            if (celsius == null) return;
            const stored = Math.round(celsius / 5) * 5;
            if (stored !== celsius) {
                warnings.push(`${label} ${celsius}°C will be stored as ${stored}°C (5°C steps)`);
            }
            putInt(field, stored / 5);
        };
        const midpoint = (a, b) => (a != null && b != null) ? (a + b) / 2 : (a ?? b);

        // Keep the version of a loaded v2 tag (its other fields follow that version)
        putInt('tag_version', Math.floor(baseVersion / 1000) === 2 ? baseVersion : this.VERSION);

        // Material and modifier. CF/GF go in the modifier field so readers
        // like OpenRFID rebuild the full material name (PLA + CF -> PLA-CF).
        const { material, fiber } = this.splitMaterial(formData.materialType || 'PLA');
        const variant = (formData.extendedSubType || '').trim();
        let modifier = variant;
        if (fiber) {
            modifier = fiber;
            if (variant) {
                warnings.push(`Variant "${variant}" can't be stored with ${material}-${fiber} (one modifier field); only "${fiber}" is written`);
            }
        }
        putString('material', 'Material', material);
        putString('material_mod', 'Modifier', modifier);
        putString('manufacturer', 'Brand', formData.brand || 'Generic');
        putString('color_name', 'Color name', formData.colorName);

        // Up to 4 colors. Unused colors stay transparent black (all zero).
        putColor('color_1', formData.colorHex || 'FFFFFF');
        for (let i = 2; i <= 4; i++) {
            const hex = formData[`colorHex${i}`];
            if (hex && hex.toUpperCase() !== 'FFFFFF') putColor(`color_${i}`, hex);
            else clear(`color_${i}`);
        }

        putString('serial', 'Serial', formData.lotNr);

        const gtin = (formData.gtin || '').trim();
        clear('barcode');
        if (gtin) {
            if (/^\d{1,14}$/.test(gtin) && Number(gtin) <= Math.pow(256, 6) - 1) {
                putInt('barcode', Number(gtin));
            } else {
                warnings.push(`GTIN "${gtin}" isn't a barcode number and won't be written`);
            }
        }

        const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(formData.manufacturedDate || '');
        clear('mfg_date');
        if (date) {
            const [start] = F.mfg_date;
            const year = parseInt(date[1], 10);
            bytes.set([year >> 8, year & 0xFF, parseInt(date[2], 10), parseInt(date[3], 10)], start);
        }

        putInt('diameter', (num(formData.filamentDiameter) ?? 1.75) * 1000);

        // Nozzle temps. Target defaults to the middle of the min/max range.
        const minTemp = int(formData.minTemp);
        const maxTemp = int(formData.maxTemp);
        const printTemp = int(formData.printTemp) ?? midpoint(minTemp, maxTemp);
        if (printTemp == null) warnings.push('No nozzle temperature set (required by OpenTag3D)');
        putTemp('print_temp', 'Target nozzle temp', printTemp != null ? Math.round(printTemp) : null);
        putTemp('min_print_temp', 'Min nozzle temp', minTemp);
        putTemp('max_print_temp', 'Max nozzle temp', maxTemp);

        putTemp('chamber_temp', 'Chamber temp', int(formData.chamberTemp) ?? 0);

        // Bed temps. Target defaults to the middle of the min/max range.
        const bedMin = int(formData.bedTempMin);
        const bedMax = int(formData.bedTempMax);
        const bedTemp = int(formData.bedTemp) ?? midpoint(bedMin, bedMax);
        if (bedTemp == null) warnings.push('No bed temperature set (required by OpenTag3D)');
        putTemp('bed_temp', 'Target bed temp', bedTemp != null ? Math.round(bedTemp) : null);
        putTemp('min_bed_temp', 'Min bed temp', bedMin);
        putTemp('max_bed_temp', 'Max bed temp', bedMax);

        putTemp('max_dry_temp', 'Drying temp', int(formData.dryTemp));
        putInt('dry_time', int(formData.dryTime) ?? 0);

        const density = num(formData.density);
        if (density == null) warnings.push('No density set (required by OpenTag3D)');
        putInt('density', (density ?? 0) * 1000);

        let weight = int(formData.nominalWeight);
        if (weight == null) {
            weight = 1000;
            warnings.push('No nominal weight set; writing 1000 g');
        }
        putInt('weight', weight);
        putInt('empty_spool_weight', int(formData.emptySpoolWeight) ?? 0);
        putInt('measured_weight', int(formData.actualWeight) ?? 0);

        putInt('td', (num(formData.td) ?? 0) * 10);

        return { bytes, warnings };
    },

    // Cut typed text to what the tag can store (used while typing, so nothing
    // is shortened later). kind is a TEXT_LIMITS key.
    limitText: function(kind, value) {
        const max = this.TEXT_LIMITS[kind];
        if (!max || value == null) return value;
        const cut = (str, bytes) => new TextDecoder().decode(this.truncateUtf8(str, bytes).encoded);
        if (kind === 'material') {
            // Allow a (partly typed) -CF/-GF suffix after the base material
            const dash = value.lastIndexOf('-');
            const suffix = dash > 0 ? value.slice(dash + 1).toUpperCase() : null;
            if (suffix !== null && ['', 'C', 'CF', 'G', 'GF'].includes(suffix)) {
                return cut(value.slice(0, dash), max) + value.slice(dash);
            }
        }
        return cut(value, max);
    },

    // "PLA-CF" -> { material: "PLA", fiber: "CF" }
    splitMaterial: function(materialType) {
        const value = materialType.trim();
        const match = /^(.+)-(CF|GF)$/i.exec(value);
        if (match) return { material: match[1], fiber: match[2].toUpperCase() };
        return { material: value, fiber: '' };
    },

    // Encode a string as UTF-8 within maxBytes without splitting a character
    truncateUtf8: function(str, maxBytes) {
        const encoder = new TextEncoder();
        const full = encoder.encode(str);
        if (full.length <= maxBytes) return { encoded: full, truncated: false };
        let out = '';
        let size = 0;
        for (const ch of str) {
            const n = encoder.encode(ch).length;
            if (size + n > maxBytes) break;
            out += ch;
            size += n;
        }
        return { encoded: encoder.encode(out), truncated: true };
    },

    parseHex: function(hex) {
        const h = (hex || '').replace('#', '');
        if (!/^[0-9A-Fa-f]{6}$/.test(h)) return null;
        return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    },

    // --- Decoding ---

    parseData: function(payload) {
        const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
        if (bytes.length < 2) throw new Error('OpenTag3D payload too short');

        // Missing trailing bytes read as 0x00, per the spec
        const data = new Uint8Array(Math.max(this.PAYLOAD_LENGTH, bytes.length));
        data.set(bytes);
        const F = this.FIELDS;

        const getInt = (field) => {
            const [start, length] = F[field];
            let v = 0;
            for (let i = 0; i < length; i++) v = v * 256 + data[start + i];
            return v;
        };
        const getString = (field) => {
            const [start, length] = F[field];
            const raw = data.slice(start, start + length);
            const end = raw.indexOf(0);
            return new TextDecoder().decode(end === -1 ? raw : raw.slice(0, end)).trim();
        };
        const getColor = (field) => {
            const [start] = F[field];
            const rgba = data.slice(start, start + 4);
            if (!rgba.some(b => b)) return '';
            return Array.from(rgba.slice(0, 3)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        };
        const temp = (field) => getInt(field) * 5;
        const str = (v) => v ? String(v) : '';
        const decimal = (v, places) => v ? String(parseFloat(v.toFixed(places))) : '';

        const version = getInt('tag_version');
        if (Math.floor(version / 1000) !== 2) {
            throw new Error(`Unsupported OpenTag3D version ${(version / 1000).toFixed(3)}`);
        }

        // Rebuild the material name: PLA + CF -> PLA-CF; other modifiers are the variant
        const material = getString('material') || 'PLA';
        const modifier = getString('material_mod');
        const isFiber = this.FIBER_MODIFIERS.includes(modifier.toUpperCase());

        const printTemp = temp('print_temp');
        const bedTemp = temp('bed_temp');

        const [ds] = F.mfg_date;
        const year = (data[ds] << 8) | data[ds + 1];
        const manufacturedDate = year
            ? `${String(year).padStart(4, '0')}-${String(data[ds + 2]).padStart(2, '0')}-${String(data[ds + 3]).padStart(2, '0')}`
            : '';

        const result = {
            format: 'opentag3d',
            tagVersion: (version / 1000).toFixed(3),
            opentag3dBase: Array.from(data.slice(0, this.PAYLOAD_LENGTH)),
            materialType: isFiber ? `${material}-${modifier.toUpperCase()}` : material,
            extendedSubType: isFiber ? '' : modifier,
            brand: getString('manufacturer') || 'Generic',
            colorName: getString('color_name'),
            colorHex: getColor('color_1') || '000000',
            lotNr: getString('serial'),
            gtin: str(getInt('barcode')),
            manufacturedDate,
            filamentDiameter: decimal(getInt('diameter') / 1000, 3) || '1.75',
            printTemp: str(printTemp),
            // Missing min/max fall back to the target, like OpenRFID does
            minTemp: str(temp('min_print_temp') || printTemp),
            maxTemp: str(temp('max_print_temp') || printTemp),
            chamberTemp: str(temp('chamber_temp')),
            bedTemp: str(bedTemp),
            bedTempMin: str(temp('min_bed_temp') || bedTemp),
            bedTempMax: str(temp('max_bed_temp') || bedTemp),
            dryTemp: str(temp('max_dry_temp')),
            dryTime: str(getInt('dry_time')),
            density: decimal(getInt('density') / 1000, 3),
            nominalWeight: str(getInt('weight')),
            emptySpoolWeight: str(getInt('empty_spool_weight')),
            actualWeight: str(getInt('measured_weight')),
            td: decimal(getInt('td') / 10, 1)
        };
        for (let i = 2; i <= 4; i++) {
            const hex = getColor(`color_${i}`);
            if (hex) result[`colorHex${i}`] = hex;
        }
        return result;
    },

    // --- NDEF / files ---

    createNDEFRecord: function(payload) {
        return [{
            recordType: "mime",
            mediaType: this.MIME_TYPE,
            data: payload
        }];
    },

    parseNDEFRecord: function(record) {
        if (record.recordType !== "mime" || record.mediaType !== this.MIME_TYPE) {
            return null;
        }
        const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
        try {
            return this.parseData(bytes);
        } catch (e) {
            console.error('Error parsing OpenTag3D:', e);
            return null;
        }
    },

    // Download as binary NDEF file
    download: function(payload, filename = 'opentag3d.bin') {
        const ndefBytes = NDEF.serialize(payload, this.MIME_TYPE);
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

    // Read an NDEF tag dump containing an OpenTag3D record
    readBinary: function(buffer) {
        try {
            const payload = NDEF.deserialize(buffer, this.MIME_TYPE);
            return payload ? this.parseData(payload) : null;
        } catch (e) {
            console.error('Error reading OpenTag3D binary:', e);
            return null;
        }
    }
};
