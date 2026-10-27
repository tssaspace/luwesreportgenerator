"""Turn source/pm-template.docx into template.js (page 1 with {{placeholders}}, empty doc/photo sections).
Run:  python3 tools/build_template.py
"""
import base64, io, json, re, zipfile, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = zipfile.ZipFile(ROOT / 'source' / 'pm-template.docx')
doc = src.read('word/document.xml').decode('utf8')

b0 = doc.index('<w:body>') + 8
# end of the section-1 break paragraph (carries the first sectPr)
s1 = doc.index('<w:sectPr><w:headerReference')
p1_end = doc.index('</w:p>', s1) + 6
page1 = doc[b0:p1_end]

# ---- the "Dokumentasi Kegiatan" title paragraph (shape + gap), reused by the JS generator
after = doc[p1_end:]
i650 = after.index('w:line="650"')
h0 = after.rindex('<w:p>', 0, i650)
end_tag = '</mc:AlternateContent></w:r></w:p>'
h1 = after.index(end_tag, h0) + len(end_tag)
doc_head = after[h0:h1]

final_sect = doc[doc.rindex('<w:sectPr>'):doc.index('</w:body>')]

# ---- placeholders on page 1
def sub_once(text, old, new):
    assert text.count(old) == 1, (old, text.count(old))
    return text.replace(old, new)

page1 = sub_once(page1, '> Jasa Pemeliharaan dan Pengoperasian Structural Health Monitoring System<', '> {{WORK_TITLE}}<')
page1 = sub_once(page1, '> 07-10-2026 sampai 08-10-2026<', '> {{DATE}}<')
page1 = sub_once(page1, '> DL 12k028, Benhill – Istora<', '> {{LOCATION}}<')
page1 = sub_once(page1, '> 23:30 – 02:30<', '> {{TIME}}<')
page1 = sub_once(page1, '> Erdianto Sitorus, Anggi<', '> {{PIC}}<')
page1 = sub_once(page1, '> 1<', '> {{LAMPIRAN}}<')
# WO: the third cell of the "WO" row holds a lone space run
i = page1.index('>WO<')
j = page1.index('<w:t xml:space="preserve"> </w:t>', page1.index('>:<', i))
page1 = page1[:j] + '<w:t xml:space="preserve"> {{WO}}</w:t>' + page1[j + len('<w:t xml:space="preserve"> </w:t>'):]

# signature names (row 3 of the second table)
page1 = sub_once(page1, '>Joseph Elroy<', '>{{S1_NAME}}<')
page1 = sub_once(page1, '>PT. Luwes Inovasi Mandiri<', '>{{S1_ORG}}<')
# cells 3 and 5 of that row are empty paragraphs: give each a name + org paragraph
k = page1.index('{{S1_ORG}}')
row_end = page1.index('</w:tr>', k)
tail = page1[row_end:]
head = page1[:row_end]
empties = list(re.finditer(r'<w:p (?:(?!</w:p>).)*?w:jc w:val="center"/>(?:(?!</w:p>).)*?</w:p>', head[k:], re.S))
# the two centred empty paragraphs after the first cell
cands = [m for m in empties if '<w:t' not in m.group(0)]
assert len(cands) == 2, len(cands)
def person(n, para):
    ppr = re.search(r'<w:pPr>.*?</w:pPr>', para, re.S).group(0)
    rpr = '<w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
    mk = lambda tok: f'<w:p>{ppr}<w:r>{rpr}<w:t xml:space="preserve">{tok}</w:t></w:r></w:p>'
    return mk('{{S%d_NAME}}' % n) + mk('{{S%d_ORG}}' % n)
new_head = head[:k]
last = 0
seg = head[k:]
out = ''
for n, m in zip((2, 3), cands):
    out += seg[last:m.start()] + person(n, m.group(0))
    last = m.end()
out += seg[last:]
page1 = new_head + out + tail

body = page1 + '@@DOC@@@@PHOTOS@@' + final_sect
new_doc = doc[:b0] + body + doc[doc.index('</w:body>'):]

rels = src.read('word/_rels/document.xml.rels').decode('utf8')
# ---- rebuild the package without the placeholder photos
keep_media = {'media/image16.png'}   # 1×1 fallback used by the title shape
# plus whatever page 1 / the title shape reference (logos etc.)
for rid in set(re.findall(r'r:embed="(rId\d+)"', page1 + doc_head)):
    keep_media.add(re.search(r'Id="%s"[^>]*Target="(media/[^"]+)"' % rid, rels).group(1))
def keep_rel(m):
    r = m.group(0)
    t = re.search(r'Target="(media/[^"]+)"', r)
    return r if (not t or t.group(1) in keep_media) else ''
rels = re.sub(r'<Relationship [^>]*/>', keep_rel, rels)

buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
    for info in src.infolist():
        n = info.filename
        data = src.read(n)
        if n == 'word/document.xml': data = new_doc.encode('utf8')
        elif n == 'word/_rels/document.xml.rels': data = rels.encode('utf8')
        elif n.startswith('word/media/'):
            hdr = src.read('word/_rels/header1.xml.rels').decode()
            if n[5:] not in keep_media and n[5:] not in re.findall(r'Target="(media/[^"]+)"', hdr):
                continue
        z.writestr(n, data)

js = 'window.PM_TEMPLATE = ' + json.dumps({
    'zip': base64.b64encode(buf.getvalue()).decode(),
    'docHead': doc_head,
}) + ';\n'
(ROOT / 'template.js').write_text(js, encoding='utf8')
print('template.js', len(js) // 1024, 'KB')
