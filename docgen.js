/* Builds the Preventive Maintenance report (.docx) from the form data.
 * Works in the browser and in Node (tests): pass the JSZip constructor in.
 */
(function (root) {
  'use strict';

  var TW = 10160;                 // text width in twips (page 12240 − 2×1040 margins)
  var COL = TW / 2;
  var PAD = 115;                  // uniform padding inside photo cells (twips)
  var EMU = 635;                  // EMU per twip
  var IW = (COL - 2 * PAD) * EMU; // documentation photo frame (16:9)
  var IH = Math.round(IW * 9 / 16);
  var CHECK_MAX_W = 9400 * EMU;   // checklist photo box (fits between header and footer)
  var CHECK_MAX_H = 11400 * EMU;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function circled(n) {
    if (n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
    if (n >= 21 && n <= 35) return String.fromCharCode(0x3251 + n - 21);
    if (n >= 36 && n <= 50) return String.fromCharCode(0x32B1 + n - 36);
    return '(' + n + ')';
  }

  // center crop to the target aspect ratio -> srcRect values in 1/1000 %
  function crop(w, h, ratio) {
    var l = 0, t = 0;
    if (w / h > ratio) l = Math.round((1 - (h * ratio) / w) / 2 * 100000);
    else t = Math.round((1 - (w / ratio) / h) / 2 * 100000);
    return { l: l, r: l, t: t, b: t };
  }

  function blip(rid, name, id, cx, cy, src) {
    return '<wp:docPr id="' + id + '" name="' + esc(name) + '"/>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      '<pic:nvPicPr><pic:cNvPr id="0" name="' + esc(name) + '"/><pic:cNvPicPr preferRelativeResize="0"/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:srcRect b="' + src.b + '" l="' + src.l + '" r="' + src.r + '" t="' + src.t + '"/>' +
      '<a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"/><a:ln/></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic>';
  }

  var B = '<w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/>';

  function photoCell(n, item) {
    var head = '<w:tc><w:tcPr><w:tcW w:w="' + COL + '" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>';
    if (!item) return head + '<w:p><w:pPr><w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p></w:tc>';
    return head +
      '<w:p><w:pPr><w:keepNext/><w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/><w:rPr>' + B + '</w:rPr></w:pPr>' +
      '<w:r><w:rPr>' + B + '</w:rPr><w:t>' + circled(n) + '</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:keepNext/><w:spacing w:after="0" w:before="' + PAD + '" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr>' +
      '<w:r><w:drawing><wp:inline distB="0" distT="0" distL="0" distR="0"><wp:extent cx="' + IW + '" cy="' + IH + '"/>' +
      '<wp:effectExtent b="0" l="0" r="0" t="0"/>' +
      blip(item.rid, item.mediaName, item.docId, IW, IH, crop(item.w, item.h, 16 / 9)) +
      '</wp:inline></w:drawing></w:r></w:p></w:tc>';
  }

  function captionCell(item) {
    return '<w:tc><w:tcPr><w:tcW w:w="' + COL + '" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>' +
      '<w:p><w:pPr><w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:rPr>' + B + '</w:rPr></w:pPr>' +
      (item && item.caption ? '<w:r><w:rPr>' + B + '</w:rPr><w:t xml:space="preserve">' + esc(item.caption) + '</w:t></w:r>' : '') +
      '</w:p></w:tc>';
  }

  function docTable(items) {
    var tblPr = '<w:tblPr><w:tblStyle w:val="Table3"/><w:tblW w:w="' + TW + '" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/>' +
      '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) {
        return '<w:' + s + ' w:color="000000" w:space="0" w:sz="4" w:val="single"/>';
      }).join('') + '</w:tblBorders><w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:top w:w="' + PAD + '" w:type="dxa"/><w:left w:w="' + PAD + '" w:type="dxa"/><w:bottom w:w="' + PAD + '" w:type="dxa"/><w:right w:w="' + PAD + '" w:type="dxa"/></w:tblCellMar>' +
      '<w:tblLook w:val="0400"/></w:tblPr>';
    var tr = '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
    var rows = '';
    for (var i = 0; i < items.length; i += 2) {
      var a = items[i], b = items[i + 1];
      rows += tr + photoCell(i + 1, a) + photoCell(i + 2, b) + '</w:tr>';
      rows += tr + captionCell(a) + captionCell(b) + '</w:tr>';
    }
    return '<w:tbl>' + tblPr + '<w:tblGrid><w:gridCol w:w="' + COL + '"/><w:gridCol w:w="' + COL + '"/></w:tblGrid>' + rows + '</w:tbl>';
  }

  function checkPage(item) {
    // size in EMU keeping the pixel aspect ratio, as large as the box allows
    var k = Math.min(CHECK_MAX_W / item.w, CHECK_MAX_H / item.h);
    var cx = Math.round(item.w * k), cy = Math.round(item.h * k);
    return '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:drawing>' +
      '<wp:anchor allowOverlap="1" behindDoc="0" distB="0" distT="0" distL="0" distR="0" hidden="0" layoutInCell="1" locked="0" relativeHeight="0" simplePos="0">' +
      '<wp:simplePos x="0" y="0"/>' +
      '<wp:positionH relativeFrom="margin"><wp:align>center</wp:align></wp:positionH>' +
      '<wp:positionV relativeFrom="margin"><wp:align>center</wp:align></wp:positionV>' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent b="0" l="0" r="0" t="0"/><wp:wrapNone/>' +
      blip(item.rid, item.mediaName, item.docId, cx, cy, { l: 0, r: 0, t: 0, b: 0 }) +
      '</wp:anchor></w:drawing></w:r></w:p>';
  }

  // remove the paragraph holding `token` (used for empty organisation lines)
  function dropParagraph(xml, token) {
    var i = xml.indexOf(token);
    if (i < 0) return xml;
    var a = Math.max(xml.lastIndexOf('<w:p>', i), xml.lastIndexOf('<w:p ', i));
    var b = xml.indexOf('</w:p>', i) + 6;
    return xml.slice(0, a) + xml.slice(b);
  }

  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }

  function dateText(f) {
    var a = fmtDate(f.dateStart), b = fmtDate(f.dateEnd);
    if (a && b && a !== b) return a + ' sampai ' + b;
    return a || b;
  }

  function timeText(f) {
    if (f.timeStart && f.timeEnd) return f.timeStart + ' – ' + f.timeEnd;
    return f.timeStart || f.timeEnd || '';
  }

  /**
   * data: { fields:{...}, docs:[{caption, bytes, w, h}], checks:[{bytes, w, h}] }
   * returns Promise<Uint8Array>
   */
  function build(JSZip, data) {
    var T = root.PM_TEMPLATE;
    return JSZip.loadAsync(T.zip, { base64: true }).then(function (zip) {
      return zip.file('word/document.xml').async('string').then(function (xml) {
        return zip.file('word/_rels/document.xml.rels').async('string').then(function (rels) {
          return zip.file('[Content_Types].xml').async('string').then(function (ct) {
            var f = data.fields, docId = 100, relXml = '';
            var docs = data.docs.map(function (d, i) {
              var n = i + 1;
              docId++;
              relXml += '<Relationship Id="rIdPmD' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pm_doc_' + n + '.jpg"/>';
              zip.file('word/media/pm_doc_' + n + '.jpg', d.bytes, { compression: 'STORE' });
              return { caption: d.caption, w: d.w, h: d.h, rid: 'rIdPmD' + n, mediaName: 'pm_doc_' + n + '.jpg', docId: docId };
            });
            var checks = data.checks.map(function (d, i) {
              var n = i + 1;
              docId++;
              relXml += '<Relationship Id="rIdPmC' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pm_check_' + n + '.jpg"/>';
              zip.file('word/media/pm_check_' + n + '.jpg', d.bytes, { compression: 'STORE' });
              return { w: d.w, h: d.h, rid: 'rIdPmC' + n, mediaName: 'pm_check_' + n + '.jpg', docId: docId };
            });

            var docPart = docs.length ? (T.docHead + docTable(docs)) : '';
            var photoPart = checks.map(checkPage).join('');
            xml = xml.replace('@@DOC@@', function () { return docPart; })
                     .replace('@@PHOTOS@@', function () { return photoPart; });

            var vals = {
              WORK_TITLE: f.workTitle, WO: f.wo, DATE: dateText(f), LOCATION: f.location, TIME: timeText(f), PIC: f.pic,
              LAMPIRAN: f.lampiran !== '' && f.lampiran != null ? f.lampiran : String(checks.length),
              S1_NAME: f.s1Name, S1_ORG: f.s1Org, S2_NAME: f.s2Name, S2_ORG: f.s2Org, S3_NAME: f.s3Name, S3_ORG: f.s3Org
            };
            ['S1_ORG', 'S2_ORG', 'S3_ORG'].forEach(function (k) {
              if (!String(vals[k] || '').trim()) xml = dropParagraph(xml, '{{' + k + '}}');
            });
            Object.keys(vals).forEach(function (k) {
              xml = xml.split('{{' + k + '}}').join(esc(vals[k]));
            });
            if (/\{\{[A-Z0-9_]+\}\}|@@/.test(xml)) throw new Error('Placeholder template belum terisi semua');

            zip.file('word/document.xml', xml);
            zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', relXml + '</Relationships>'));
            zip.file('[Content_Types].xml', ct); // jpg/png defaults already declared
            return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
          });
        });
      });
    });
  }

  root.PMDoc = { build: build, dateText: dateText, timeText: timeText, circled: circled, _crop: crop };
  if (typeof module !== 'undefined') module.exports = root.PMDoc;
})(typeof window !== 'undefined' ? window : globalThis);
