const formats = {
    generateData(format, formData) {
        if (format === 'openspool') {
            return OpenSpool.generateData(formData);
        } else if (format === 'openprinttag') {
            return OpenPrintTag.generateData(formData);
        }
        throw new Error(`Unknown format: ${format}`);
    },

    createNDEFRecord(format, data) {
        if (format === 'openspool') {
            return OpenSpool.createNDEFRecord(data);
        } else if (format === 'openprinttag') {
            return OpenPrintTag.createNDEFRecord(data);
        }
        throw new Error(`Unknown format: ${format}`);
    },

    parseNDEFRecord(record) {
        // Try OpenSpool first
        const openspoolData = OpenSpool.parseNDEFRecord(record);
        if (openspoolData) {
            return { format: 'openspool', data: openspoolData };
        }

        // Try OpenPrintTag
        const openprinttagData = OpenPrintTag.parseNDEFRecord(record);
        if (openprinttagData) {
            return { format: 'openprinttag', data: openprinttagData };
        }

        return null;
    },

    parseData(format, buffer) {
        if (format === 'openspool') {
            return OpenSpool.readBinary(buffer);
        } else if (format === 'openprinttag') {
            return OpenPrintTag.readBinary(buffer);
        }
        throw new Error(`Unknown format: ${format}`);
    },

    download(format, data) {
        if (format === 'openspool') {
            OpenSpool.downloadJSON(data);
        } else if (format === 'openprinttag') {
            OpenPrintTag.downloadBinary(data);
        } else {
            throw new Error(`Unknown format: ${format}`);
        }
    },

    getFileExtension(format) {
        if (format === 'openspool') {
            return '.json';
        } else if (format === 'openprinttag') {
            return '.bin';
        }
        throw new Error(`Unknown format: ${format}`);
    },

    getDisplayName(format) {
        if (format === 'openspool') {
            return 'OpenSpool (JSON)';
        } else if (format === 'openprinttag') {
            return 'OpenPrintTag (CBOR)';
        }
        throw new Error(`Unknown format: ${format}`);
    },

    detectFormatFromFilename(filename) {
        if (filename.endsWith('.json')) {
            return 'openspool';
        } else if (filename.endsWith('.bin')) {
            return 'openprinttag';
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
