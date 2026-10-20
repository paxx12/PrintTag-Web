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

This application supports three open standards:

- **OpenSpool RFID**: Simple JSON-based format for basic filament data
- **OpenPrintTag**: Comprehensive CBOR-based format with advanced fields
- **OpenTag3D v2**: Fixed binary memory map (needs NTAG215/216), e.g. factory-tagged spools

**Creating New Tags:**

- Only OpenSpool (JSON) format is supported when creating new tags
- This ensures compatibility and simplicity for most use cases

**Reading/Updating Existing Tags:**

- OpenSpool (JSON), OpenPrintTag (CBOR) and OpenTag3D v2 formats are fully supported
- You can read, modify, and re-write tags in any of these formats

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

### OpenTag3D v2 Format

Tags are written as an `application/opentag3d` NDEF record holding the
224-byte core memory map from the [OpenTag3D spec](https://opentag3d.info/spec.html)
(version 2.003). Notes on how form fields are stored:

- `PLA-CF` / `PLA-GF` style materials are split into the base material and a
  `CF`/`GF` modifier, so the Material Variant is hidden for them; otherwise the
  Material Variant is the modifier
- Text fields have fixed byte limits (material and modifier 5, brand 16, serial 32):
  custom text boxes stop at the limit and variants that don't fit are hidden.
  Temperatures are stored in 5°C steps; the form lists anything that will change
- Target nozzle/bed temps default to the middle of the min/max range

These formats are compatible with various 3D printing ecosystem tools and slicer software.

## Resources

- [OpenSpool RFID Specification](https://openspool.io/rfid.html)
- [OpenPrintTag Specification](https://specs.openprinttag.org/)
- [OpenTag3D Specification](https://opentag3d.info/spec.html)
- [Web NFC API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API)

## License

To be defined

## Copyright

© 2025 [paxx12](https://github.com/paxx12/)
