"""Validate shipped PNG/SVG resources with Python's standard library."""
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zlib
ROOT = Path(__file__).resolve().parent.parent

def validate_png(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('PNG signature')
    pos, chunks, compressed = 8, [], bytearray()
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
            width, height = struct.unpack('>II', content[:8])
            if not width or not height: raise ValueError('image size')
        if kind == b'IDAT': compressed.extend(content)
        pos += 12 + size
    if not chunks or chunks[0] != b'IHDR' or chunks[-1] != b'IEND' or not compressed: raise ValueError('PNG structure')
    zlib.decompress(compressed)

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
