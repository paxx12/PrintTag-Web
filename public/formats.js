const formats = {
    FORMATS: {
        'openspool_extended': { module: OpenSpool, label: 'OpenSpool - Snapmaker U1 Extended (JSON)', hidden: false },
        'openspool_compat': { module: OpenSpool, label: 'OpenSpool - Compat (JSON)', hidden: false },
        'opentag3d': { module: OpenTag3D, label: 'OpenTag3D v2 (Binary)', hidden: true },
        'openprinttag': { module: OpenPrintTag, label: 'OpenPrintTag (CBOR)', hidden: true }
    },

    availableFormats(withHidden = false) {
        return Object.entries(this.FORMATS)
            .filter(([id, cfg]) => withHidden || !cfg.hidden)
            .map(([id, cfg]) => ({ id, label: cfg.label, hidden: !!cfg.hidden }));
    },

    getDisplayName(format) {
        const cfg = this.FORMATS[format];
        return cfg ? cfg.label : format;
    },

    availableFields(format, formData) {
        if (!this.FORMATS[format])
            return null;
        return this.FORMATS[format].module.availableFields(formData);
    },

    generateData(format, formData) {
        if (!this.FORMATS[format])
            throw new Error(`Unknown format: ${format}`);
        return this.FORMATS[format].module.generateData(formData);
    },

    createNDEFRecord(format, data) {
        if (!this.FORMATS[format])
            throw new Error(`Unknown format: ${format}`);
        return this.FORMATS[format].module.createNDEFRecord(data);
    },

    parseNDEFRecord(record) {
        // Try OpenSpool first
        const openspoolData = OpenSpool.parseNDEFRecord(record);
        if (openspoolData) {
            return { format: openspoolData.format || 'openspool', data: openspoolData };
        }

        // Try OpenPrintTag
        const openprinttagData = OpenPrintTag.parseNDEFRecord(record);
        if (openprinttagData) {
            return { format: 'openprinttag', data: openprinttagData };
        }

        // Try OpenTag3D
        const opentag3dData = OpenTag3D.parseNDEFRecord(record);
        if (opentag3dData) {
            return { format: 'opentag3d', data: opentag3dData };
        }

        return null;
    },

    parseData(format, buffer) {
        if (!this.FORMATS[format])
            throw new Error(`Unknown format: ${format}`);
        return this.FORMATS[format].module.parseData(buffer);
    },

    download(format, data) {
        if (!this.FORMATS[format])
            throw new Error(`Unknown format: ${format}`);
        return this.FORMATS[format].module.download(data);
    },

    getFileExtension(format) {
        if (!this.FORMATS[format])
            throw new Error(`Unknown format: ${format}`);
        return this.FORMATS[format].module.getFileExtension(format);
    },

    // Warnings about values that will change when written (format-specific)
    getWarnings(format, formData) {
        const module = this.FORMATS[format] && this.FORMATS[format].module;
        if (!module || typeof module.getWarnings !== 'function') return [];
        try {
            return module.getWarnings(formData);
        } catch (e) {
            return [];
        }
    },

    // Parse a downloaded tag file. Several formats share an extension (.bin),
    // so try each format matching the extension and use the first that parses.
    parseFile(filename, buffer) {
        const name = filename.toLowerCase();
        for (const key in this.FORMATS) {
            const module = this.FORMATS[key].module;
            if (!name.endsWith(module.getFileExtension(key))) continue;
            const data = module.readBinary(buffer);
            if (data) return { format: data.format || key, data };
        }
        return null;
    },

    calculateRecordSize(format, formData) {
        try {
            const data = this.generateData(format, formData);
            const records = this.createNDEFRecord(format, data);

            let totalSize = 0;
            for (const record of records) {
                // NDEF record header overhead
                // 1 byte: flags
                // 1 byte: type length
                // 1-4 bytes: payload length (depends on size)
                // No ID field for our records
                const mediaType = record.mediaType;
                const payloadSize = record.data.byteLength || record.data.length;

                let headerSize = 2; // flags + type length
                if (payloadSize < 256) {
                    headerSize += 1; // short record (1 byte payload length)
                } else {
                    headerSize += 4; // long record (4 byte payload length)
                }

                const typeLength = mediaType.length;
                const recordSize = headerSize + typeLength + payloadSize;
                totalSize += recordSize;
            }

            return totalSize;
        } catch (e) {
            return 0;
        }
    }
};
