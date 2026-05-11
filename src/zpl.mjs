function mmToDots(mm, dpi) {
  return Math.round((Number(mm) / 25.4) * Number(dpi));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function bytesToZplFieldData(bytes) {
  let out = "";
  for (const b of bytes) {
    const ch = String.fromCharCode(b);
    const isPrintable = b >= 32 && b <= 126;
    const needsEscape = ch === "\\" || ch === "^" || ch === "~";
    if (isPrintable && !needsEscape) out += ch;
    else out += `\\${b.toString(16).padStart(2, "0").toUpperCase()}`;
  }
  return `^FH\\^FD${out}^FS`;
}

function zplText(text) {
  const bytes = Buffer.from(String(text ?? ""), "utf8");
  return bytesToZplFieldData(bytes);
}

function zplRotationToOrientation(rotationDeg) {
  const r = Number(rotationDeg);
  if (r === 90) return "R";
  if (r === 180) return "I";
  if (r === 270) return "B";
  return "N";
}

function zplJustification(align) {
  const a = String(align || "").toLowerCase();
  if (a === "center") return "C";
  if (a === "right") return "R";
  return "L";
}

export function generateZplForTemplate(template) {
  const dpi = 203;
  const widthDots = mmToDots(template.label?.widthMm ?? 50, dpi);
  const heightDots = mmToDots(template.label?.heightMm ?? 30, dpi);
  const offsetXDots = mmToDots(template.label?.offsetXMm ?? 0, dpi);
  const offsetYDots = mmToDots(template.label?.offsetYMm ?? 0, dpi);

  const lines = [];
  lines.push("^XA");
  lines.push("^CI28");
  lines.push(`^PW${widthDots}`);
  lines.push(`^LL${heightDots}`);
  if (offsetXDots !== 0 || offsetYDots !== 0) {
    lines.push(`^LH${offsetXDots},${offsetYDots}`);
  }

  const objects = Array.isArray(template.objects) ? template.objects : [];
  for (const obj of objects) {
    if (!obj || typeof obj !== "object") continue;

    if (obj.type === "text") {
      const rawX = mmToDots(obj.xMm ?? 0, dpi);
      const rawY = mmToDots(obj.yMm ?? 0, dpi);
      const h = Math.max(1, mmToDots(obj.fontHeightMm ?? 4, dpi));
      const w = h;
      const rotateDeg = Number(obj.rotateDeg ?? 0);
      const o = zplRotationToOrientation(rotateDeg);
      const j = zplJustification(obj.align);
      const text = String(obj.text ?? "");
      const rawBlockWidthDots = obj.wMm != null ? Math.max(1, mmToDots(obj.wMm ?? 0, dpi)) : 0;
      const estimatedWidthDots = Math.max(1, text.length * w);
      const blockWidthForPlacement = rawBlockWidthDots > 0 ? rawBlockWidthDots : estimatedWidthDots;

      let x = rawX;
      let y = rawY;
      if (rotateDeg === 90) {
        x -= h;
      } else if (rotateDeg === 180) {
        x -= blockWidthForPlacement;
        y -= h;
      } else if (rotateDeg === 270) {
        y -= blockWidthForPlacement;
      }
      x = clamp(x, 0, Math.max(0, widthDots - 1));
      y = clamp(y, 0, Math.max(0, heightDots - 1));

      if (rotateDeg === 0 && rawBlockWidthDots > 0) {
        const maxBlock = Math.max(1, widthDots - x);
        const blockWidthDots = clamp(rawBlockWidthDots, 1, maxBlock);
        const maxLines = Math.max(1, Math.floor((heightDots - y) / h));
        lines.push(`^FO${x},${y}^A0${o},${h},${w}^FB${blockWidthDots},${maxLines},0,${j},0${zplText(text)}`);
      } else {
        lines.push(`^FO${x},${y}^A0${o},${h},${w}${zplText(text)}`);
      }
    }

    if (obj.type === "box") {
      const x = mmToDots(obj.xMm ?? 0, dpi);
      const y = mmToDots(obj.yMm ?? 0, dpi);
      const w = Math.max(1, mmToDots(obj.wMm ?? 10, dpi));
      const h = Math.max(1, mmToDots(obj.hMm ?? 10, dpi));
      const t = Math.max(1, mmToDots(obj.thicknessMm ?? 0.3, dpi));
      lines.push(`^FO${x},${y}^GB${w},${h},${t}^FS`);
    }

    if (obj.type === "barcode") {
      const x = mmToDots(obj.xMm ?? 0, dpi);
      const y = mmToDots(obj.yMm ?? 0, dpi);
      const h = Math.max(10, mmToDots(obj.heightMm ?? 10, dpi));
      const data = String(obj.data ?? "");
      lines.push(`^FO${x},${y}^BCN,${h},Y,N,N${zplText(data)}`);
    }

    if (obj.type === "qrcode") {
      const x = mmToDots(obj.xMm ?? 0, dpi);
      const y = mmToDots(obj.yMm ?? 0, dpi);
      const sizeMm = Number(obj.sizeMm ?? 0);
      const magnification =
        sizeMm > 0 ? clamp(Math.round(mmToDots(sizeMm, dpi) / 29), 1, 10) : Math.max(1, Math.min(10, Number(obj.magnification ?? 6)));
      const data = String(obj.data ?? "");
      lines.push(`^FO${x},${y}^BQN,2,${magnification}${zplText(`LA,${data}`)}`);
    }
  }

  lines.push("^XZ");
  return lines.join("\n");
}
