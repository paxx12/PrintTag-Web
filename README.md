# Filament Tag Generator

A web application for creating and managing NFC tags for 3D printing filaments. Attach tags to your filament spools so 3D printers can automatically detect material properties and adjust settings accordingly.

## Requirements

**Required:**

- Chrome browser on Android (version 89+)
- NFC-enabled Android device
- HTTPS connection (localhost works for testing)
- NTAG215 or NTAG216 NFC tags (recommended)

**Important:**

NFC features do not work on iOS devices, desktop computers, or other browsers due to Web NFC API limitations.

## Compatible NFC Tags

- **NTAG215** (504 bytes) - ✅ Recommended
- **NTAG216** (888 bytes) - ✅ Recommended
- **NTAG213** (180 bytes) - Limited capacity

## Format Specifications

This application supports two open standards:

- **OpenSpool RFID**: Simple JSON-based format for basic filament data
- **OpenPrintTag**: Comprehensive CBOR-based format with advanced fields

**Creating New Tags:**

- Only OpenSpool (JSON) format is supported when creating new tags
- This ensures compatibility and simplicity for most use cases

**Reading/Updating Existing Tags:**

- Both OpenSpool (JSON) and OpenPrintTag (CBOR) formats are fully supported
- You can read, modify, and re-write tags in either format

### OpenSpool JSON Format (Supported Keys)

When creating new tags, the following JSON structure is used:

```json
{
  "materialType": "PLA",
  "colorHex": "FFFFFF",
  "brand": "Bambu Lab",
  "minTemp": 190,
  "maxTemp": 220,
  "bedTempMin": 50,
  "bedTempMax": 60
}
```

**Supported Keys:**

- `materialType` (string) - Material type (e.g., PLA, PETG, ABS, TPU)
- `colorHex` (string) - Hex color code without # (e.g., FFFFFF)
- `brand` (string) - Manufacturer/brand name
- `minTemp` (number) - Minimum nozzle temperature in °C
- `maxTemp` (number) - Maximum nozzle temperature in °C
- `bedTempMin` (number) - Minimum bed temperature in °C
- `bedTempMax` (number) - Maximum bed temperature in °C

Both formats are compatible with various 3D printing ecosystem tools and slicer software.

## Resources

- [OpenSpool RFID Specification](https://openspool.io/rfid.html)
- [OpenPrintTag Specification](https://specs.openprinttag.org/)
- [Web NFC API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API)

## License

To be defined

## Copyright

© 2025 [paxx12](https://github.com/paxx12/)
