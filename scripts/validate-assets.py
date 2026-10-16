"""Validate shipped PNG/SVG resources with Python's standard library."""
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zlib
ROOT = Path(__file__).resolve().parent.parent

def validate_png(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('PNG signature')
    pos, chunks, compressed, header = 8, [], bytearray(), None
    while pos < len(data):
        if pos + 12 > len(data): raise ValueError('truncated PNG')
        size = struct.unpack('>I', data[pos:pos+4])[0]
        kind, content = data[pos+4:pos+8], data[pos+8:pos+8+size]
        if pos + 12 + size > len(data): raise ValueError('truncated chunk')
        crc = struct.unpack('>I', data[pos+8+size:pos+12+size])[0]
        if zlib.crc32(kind + content) & 0xffffffff != crc: raise ValueError('PNG CRC')
        chunks.append(kind)
        if kind == b'IHDR':
            if len(content) != 13: raise ValueError('IHDR length')
            header = struct.unpack('>IIBBBBB', content)
        if kind == b'IDAT': compressed.extend(content)
        pos += 12 + size
    if not chunks or chunks[0] != b'IHDR' or chunks[-1] != b'IEND' or not compressed: raise ValueError('PNG structure')
    width, height, depth, color, compression, filter_method, interlace = header
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(color)
    bit_depths = {0: (1, 2, 4, 8, 16), 2: (8, 16), 3: (1, 2, 4, 8), 4: (8, 16), 6: (8, 16)}
    if not width or not height or channels is None or depth not in bit_depths[color]: raise ValueError('IHDR fields')
    if compression != 0 or filter_method != 0 or interlace not in (0, 1): raise ValueError('IHDR methods')
    raw = zlib.decompress(compressed)
    def row_size(w): return (w * channels * depth + 7) // 8
    def pass_geometry(index):
        x0, y0, dx, dy = ((0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4),
                          (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2))[index]
        return (width - x0 + dx - 1) // dx, (height - y0 + dy - 1) // dy
    filters = []
    if interlace == 0:
        stride = 1 + row_size(width)
        if len(raw) != height * stride: raise ValueError('scanline length')
        filters = [raw[i * stride] for i in range(height)]
    else:
        offset = 0
        for index in range(7):
            pw, ph = pass_geometry(index)
            if not pw or not ph: continue
            stride = 1 + row_size(pw)
            for i in range(ph):
                start = offset + i * stride
                if start + stride > len(raw): raise ValueError('scanline length')
                filters.append(raw[start])
            offset += ph * stride
        if offset != len(raw): raise ValueError('scanline length')
    if any(f > 4 for f in filters): raise ValueError('scanline filter')

def validate_svg(data):
    root = ET.fromstring(data)
    if root.tag != '{http://www.w3.org/2000/svg}svg': raise ValueError('SVG namespace/root')
    if not root.get('viewBox') and not (root.get('width') and root.get('height')): raise ValueError('SVG dimensions')
    for node in root.iter():
        if node.tag.rsplit('}', 1)[-1] == 'script': raise ValueError('SVG script')
        for key, value in node.attrib.items():
            if key.rsplit('}', 1)[-1] == 'href' and not value.startswith('#'): raise ValueError('external SVG reference')

if __name__ == '__main__':
    count = 0
    for path in sorted((ROOT / 'assets').rglob('*')):
        if path.suffix.lower() not in ('.png', '.svg'): continue
        try: (validate_png if path.suffix.lower() == '.png' else validate_svg)(path.read_bytes())
        except Exception as error: raise ValueError(f'{path.relative_to(ROOT)}: {error}') from error
        count += 1
    print(f'Assets: {count} PNG/SVG válidos')
