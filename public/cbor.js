// CBOR encoding/decoding utilities
const CBOR = (function() {
    // Simple CBOR encoder
    function encode(map) {
        const chunks = [];

        // Encode map header (major type 5)
        const mapSize = map.size;
        if (mapSize < 24) {
            chunks.push(0xa0 + mapSize);
        } else if (mapSize < 256) {
            chunks.push(0xb8, mapSize);
        } else {
            chunks.push(0xb9, mapSize >> 8, mapSize & 0xff);
        }

        // Encode each key-value pair
        map.forEach((value, key) => {
            // Encode key (unsigned integer)
            if (key < 24) {
                chunks.push(key);
            } else if (key < 256) {
                chunks.push(0x18, key);
            } else {
                chunks.push(0x19, key >> 8, key & 0xff);
            }

            // Encode value based on type
            if (typeof value === 'number') {
                if (Number.isInteger(value) && value >= 0) {
                    // Unsigned integer (major type 0)
                    if (value < 24) {
                        chunks.push(value);
                    } else if (value < 256) {
                        chunks.push(0x18, value);
                    } else if (value < 65536) {
                        chunks.push(0x19, value >> 8, value & 0xff);
                    } else {
                        chunks.push(0x1a, (value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
                    }
                } else if (Number.isInteger(value) && value < 0) {
                    // Negative integer (major type 1)
                    const arg = -1 - value;
                    if (arg < 24) {
                        chunks.push(0x20 + arg);
                    } else if (arg < 256) {
                        chunks.push(0x38, arg);
                    } else if (arg < 65536) {
                        chunks.push(0x39, arg >> 8, arg & 0xff);
                    } else {
                        chunks.push(0x3a, (arg >> 24) & 0xff, (arg >> 16) & 0xff, (arg >> 8) & 0xff, arg & 0xff);
                    }
                } else {
                    // Float (use single precision)
                    chunks.push(0xfa);
                    const buffer = new ArrayBuffer(4);
                    const view = new DataView(buffer);
                    view.setFloat32(0, value, false);
                    chunks.push(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
                }
            } else if (typeof value === 'string') {
                // UTF-8 string (major type 3)
                const encoder = new TextEncoder();
                const bytes = encoder.encode(value);
                const len = bytes.length;
                if (len < 24) {
                    chunks.push(0x60 + len);
                } else if (len < 256) {
                    chunks.push(0x78, len);
                } else {
                    chunks.push(0x79, len >> 8, len & 0xff);
                }
                bytes.forEach(b => chunks.push(b));
            } else if (Array.isArray(value)) {
                // Array (major type 4)
                const len = value.length;
                if (len < 24) {
                    chunks.push(0x80 + len);
                } else if (len < 256) {
                    chunks.push(0x98, len);
                } else {
                    chunks.push(0x99, len >> 8, len & 0xff);
                }
                // Recursively encode array elements
                value.forEach(item => {
                    if (typeof item === 'number') {
                        if (Number.isInteger(item) && item >= 0) {
                            // Unsigned integer (major type 0)
                            if (item < 24) {
                                chunks.push(item);
                            } else if (item < 256) {
                                chunks.push(0x18, item);
                            } else if (item < 65536) {
                                chunks.push(0x19, item >> 8, item & 0xff);
                            } else {
                                chunks.push(0x1a, (item >> 24) & 0xff, (item >> 16) & 0xff, (item >> 8) & 0xff, item & 0xff);
                            }
                        } else if (Number.isInteger(item) && item < 0) {
                            // Negative integer (major type 1)
                            const arg = -1 - item;
                            if (arg < 24) {
                                chunks.push(0x20 + arg);
                            } else if (arg < 256) {
                                chunks.push(0x38, arg);
                            } else if (arg < 65536) {
                                chunks.push(0x39, arg >> 8, arg & 0xff);
                            } else {
                                chunks.push(0x3a, (arg >> 24) & 0xff, (arg >> 16) & 0xff, (arg >> 8) & 0xff, arg & 0xff);
                            }
                        } else {
                            // Float (use single precision)
                            chunks.push(0xfa);
                            const buffer = new ArrayBuffer(4);
                            const view = new DataView(buffer);
                            view.setFloat32(0, item, false);
                            chunks.push(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
                        }
                    } else if (typeof item === 'string') {
                        const encoder = new TextEncoder();
                        const bytes = encoder.encode(item);
                        const itemLen = bytes.length;
                        if (itemLen < 24) {
                            chunks.push(0x60 + itemLen);
                        } else if (itemLen < 256) {
                            chunks.push(0x78, itemLen);
                        } else {
                            chunks.push(0x79, itemLen >> 8, itemLen & 0xff);
                        }
                        bytes.forEach(b => chunks.push(b));
                    } else if (item instanceof Uint8Array) {
                        const itemLen = item.length;
                        if (itemLen < 24) {
                            chunks.push(0x40 + itemLen);
                        } else if (itemLen < 256) {
                            chunks.push(0x58, itemLen);
                        } else {
                            chunks.push(0x59, itemLen >> 8, itemLen & 0xff);
                        }
                        item.forEach(b => chunks.push(b));
                    }
                });
            } else if (value instanceof Uint8Array) {
                // Byte string (major type 2)
                const len = value.length;
                if (len < 24) {
                    chunks.push(0x40 + len);
                } else if (len < 256) {
                    chunks.push(0x58, len);
                } else {
                    chunks.push(0x59, len >> 8, len & 0xff);
                }
                value.forEach(b => chunks.push(b));
            }
        });

        return new Uint8Array(chunks);
    }

    // Simple CBOR decoder
    function decode(bytes) {
        let offset = 0;
        const data = new Uint8Array(bytes);

        function readByte() {
            return data[offset++];
        }

        function readBytes(count) {
            const result = data.slice(offset, offset + count);
            offset += count;
            return result;
        }

        function readLength(additionalInfo) {
            if (additionalInfo < 24) {
                return additionalInfo;
            } else if (additionalInfo === 24) {
                return readByte();
            } else if (additionalInfo === 25) {
                return (readByte() << 8) | readByte();
            } else if (additionalInfo === 26) {
                return (readByte() << 24) | (readByte() << 16) | (readByte() << 8) | readByte();
            } else if (additionalInfo === 27) {
                const highWord = (readByte() << 24) | (readByte() << 16) | (readByte() << 8) | readByte();
                const lowWord = (readByte() << 24) | (readByte() << 16) | (readByte() << 8) | readByte();
                return (highWord * 0x100000000) + lowWord;
            } else if (additionalInfo === 31) {
                return -1; // Indefinite length
            }
            throw new Error('Unsupported additional info: ' + additionalInfo);
        }

        function decodeValue() {
            const initialByte = readByte();
            const majorType = initialByte >> 5;
            const additionalInfo = initialByte & 0x1f;

            switch (majorType) {
                case 0: // Unsigned integer
                    return readLength(additionalInfo);

                case 1: // Negative integer
                    return -1 - readLength(additionalInfo);

                case 2: // Byte string
                    const byteLength = readLength(additionalInfo);
                    return readBytes(byteLength);

                case 3: // UTF-8 string
                    const stringLength = readLength(additionalInfo);
                    const stringBytes = readBytes(stringLength);
                    return new TextDecoder().decode(stringBytes);

                case 4: // Array
                    const array = [];
                    const arrayLength = readLength(additionalInfo);

                    if (arrayLength === -1) {
                        // Indefinite-length array: read until break (0xFF)
                        while (offset < data.length) {
                            if (data[offset] === 0xFF) {
                                offset++; // Skip break marker
                                break;
                            }
                            array.push(decodeValue());
                        }
                    } else {
                        // Definite-length array
                        for (let i = 0; i < arrayLength; i++) {
                            array.push(decodeValue());
                        }
                    }
                    return array;

                case 5: // Map
                    const map = new Map();
                    const mapLength = readLength(additionalInfo);

                    if (mapLength === -1) {
                        // Indefinite-length map: read until break (0xFF)
                        while (offset < data.length) {
                            if (data[offset] === 0xFF) {
                                offset++; // Skip break marker
                                break;
                            }
                            const key = decodeValue();
                            const val = decodeValue();
                            map.set(key, val);
                        }
                    } else {
                        // Definite-length map
                        for (let i = 0; i < mapLength; i++) {
                            const key = decodeValue();
                            const val = decodeValue();
                            map.set(key, val);
                        }
                    }
                    return map;

                case 7: // Float/special
                    if (additionalInfo === 25) { // float16
                        const h = (readByte() << 8) | readByte();
                        const sign = (h & 0x8000) >> 15;
                        const exponent = (h & 0x7C00) >> 10;
                        const fraction = h & 0x03FF;

                        if (exponent === 0) {
                            return (sign ? -1 : 1) * Math.pow(2, -14) * (fraction / 1024);
                        } else if (exponent === 0x1F) {
                            return fraction ? NaN : (sign ? -Infinity : Infinity);
                        } else {
                            return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
                        }
                    } else if (additionalInfo === 26) { // float32
                        const bytes = readBytes(4);
                        const buffer = new ArrayBuffer(4);
                        const view = new DataView(buffer);
                        bytes.forEach((b, i) => view.setUint8(i, b));
                        return view.getFloat32(0, false);
                    } else if (additionalInfo === 27) { // float64
                        const bytes = readBytes(8);
                        const buffer = new ArrayBuffer(8);
                        const view = new DataView(buffer);
                        bytes.forEach((b, i) => view.setUint8(i, b));
                        return view.getFloat64(0, false);
                    }
                    throw new Error('Unsupported float type: ' + additionalInfo);

                default:
                    throw new Error('Unsupported major type: ' + majorType);
            }
        }

        const result = decodeValue();
        if (result instanceof Map) {
            result.offset = offset;
        }
        return result;
    }

    return { encode, decode };
})();
