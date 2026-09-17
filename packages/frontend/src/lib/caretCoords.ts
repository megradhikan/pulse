// Mirror-div technique for locating the pixel position of a character offset
// inside a <textarea>, since the DOM gives no direct API for this. Needed to
// render remote users' carets (Cursor.tsx) at the right spot over the shared
// plain-text editor.
const MIRRORED_PROPS = [
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "whiteSpace",
  "wordWrap",
] as const;

export interface CaretCoords {
  top: number;
  left: number;
  height: number;
}

export function getCaretCoordinates(el: HTMLTextAreaElement, index: number): CaretCoords {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const style = div.style;
  const computed = window.getComputedStyle(el);

  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  style.position = "absolute";
  style.visibility = "hidden";
  style.left = "-9999px";
  style.top = "0";

  for (const prop of MIRRORED_PROPS) {
    const value = computed.getPropertyValue(kebabCase(prop));
    if (value) style.setProperty(kebabCase(prop), value);
  }

  div.textContent = el.value.substring(0, index);
  const span = document.createElement("span");
  span.textContent = el.value.substring(index) || ".";
  div.appendChild(span);

  const coords: CaretCoords = {
    top: span.offsetTop + parseInt(computed.borderTopWidth || "0", 10) - el.scrollTop,
    left: span.offsetLeft + parseInt(computed.borderLeftWidth || "0", 10) - el.scrollLeft,
    height: parseInt(computed.lineHeight, 10) || parseInt(computed.fontSize, 10) * 1.2,
  };

  document.body.removeChild(div);
  return coords;
}

function kebabCase(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
