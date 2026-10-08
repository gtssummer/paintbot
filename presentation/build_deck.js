// Builds "History of My University: 1931-1940" (MOPI) as a .pptx.
// Usage: node build_deck.js [out.pptx]
// Photo frames are real PowerPoint picture placeholders: click the icon in a
// frame to insert a photo, PowerPoint crops it to fill the frame.
const path = require("path");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.APPLY_THEME || "./apply_theme.js");

const OUT = process.argv[2] || path.join(__dirname, "MOPI_History_1931-1940.pptx");

const THEME = {
  name: "MOPI Rose",
  headFontFace: "Times New Roman",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "2B2A2E", // charcoal
    lt1: "FFFFFF",
    dk2: "5E5459", // muted plum grey, secondary text
    lt2: "F6E9ED", // pale blush
    accent1: "C48B9C", // dusty rose (large decorative type)
    accent2: "9E6475", // deep rose (text-safe on white)
    accent3: "E8CBD4", // light rose
    accent4: "8C8C91",
    accent5: "4A4448",
    accent6: "D9B8A0",
    hlink: "9E6475",
    folHlink: "5E5459",
  },
};
const SCRIPT = "Segoe Script";
const SOFT_WHITE = "ECE4E7";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.title = "History of My University: 1931-1940";
pres.author = "Margarita Kondakova, Elizaveta Vashchina, Alexandra Abdulmanova";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ---------- layouts ----------
// A tinted block sits under each photo frame so the slide still looks finished
// before a photo is inserted (empty placeholders are hidden in slide show).
const photo = (x, y, w, h, dark) => [
  { rect: { x, y, w, h, fill: { color: dark ? C.accent5 : C.accent3 } } },
  {
  placeholder: {
    options: { name: "photo", type: "image", x, y, w, h, color: dark ? "ECE4E7" : "5E5459", fontSize: 12, align: "center", valign: "middle" },
    text: "Click the icon to add a photo",
  },
  },
];
const title = (x, w, color, y = 0.55, h = 0.9) => ({
  placeholder: {
    options: { name: "title", type: "title", x, y, w, h, align: "left", fontFace: THEME.headFontFace, fontSize: 40, color: color || C.text1, valign: "top", margin: 0 },
    text: "",
  },
});
const footer = (x, w, dark) => ({
  text: {
    text: "HISTORY OF MY UNIVERSITY  ·  1931–1940",
    options: { x, y: 6.9, w, h: 0.3, fontSize: 10, charSpacing: 3, color: dark ? C.accent1 : C.text2, margin: 0, valign: "middle" },
  },
});
const num = (x, dark) => ({ x, y: 6.9, w: 0.5, h: 0.3, fontSize: 10, color: dark ? C.accent1 : C.text2, align: "right", valign: "middle", margin: 0 });

pres.defineSlideMaster({ title: "Title", background: { color: C.text1 }, objects: [...photo(6.6, 0, 6.733, 7.5, true), title(0.7, 5.7, C.background1, 1.6, 2.0)] });
pres.defineSlideMaster({ title: "Photo Left", background: { color: C.background1 }, objects: [...photo(0, 0, 5.0, 7.5), title(5.7, 7.0), footer(5.7, 5)], slideNumber: num(12.13) });
pres.defineSlideMaster({ title: "Photo Right", background: { color: C.background1 }, objects: [...photo(8.6, 0, 4.733, 7.5), title(0.7, 7.4), footer(0.7, 5)], slideNumber: num(7.6) });
pres.defineSlideMaster({ title: "Photo Diagonal", background: { color: C.background1 }, objects: [...photo(6.4, 0, 6.933, 7.5), title(0.7, 5.6), footer(0.7, 5)], slideNumber: num(5.3) });
pres.defineSlideMaster({
  title: "Rose Panel",
  background: { color: C.background1 },
  objects: [{ rect: { x: 0, y: 0, w: 4.6, h: 7.5, fill: { color: C.accent1 } } }, title(5.3, 7.4), footer(5.3, 5)],
  slideNumber: num(12.13),
});
pres.defineSlideMaster({ title: "Title Only", background: { color: C.background1 }, objects: [title(0.7, 11.9), footer(0.7, 5)], slideNumber: num(12.13) });
pres.defineSlideMaster({ title: "Title Only Blush", background: { color: C.background2 }, objects: [title(0.7, 11.9), footer(0.7, 5)], slideNumber: num(12.13) });
pres.defineSlideMaster({ title: "Dark Photo Right", background: { color: C.text1 }, objects: [...photo(7.9, 0, 5.433, 7.5, true), title(0.7, 6.9, C.background1), footer(0.7, 5, true)], slideNumber: num(6.9, true) });
pres.defineSlideMaster({ title: "Dark Photo Left", background: { color: C.text1 }, objects: [...photo(0, 0, 5.2, 7.5, true)] });

// ---------- helpers ----------
const T = (slide, text, opts) => slide.addText(text, { isTextBox: true, margin: 0, valign: "top", ...opts });
const addPhoto = (slide, dark) => slide.addText("", { placeholder: "photo", fill: { color: dark ? C.accent5 : C.accent3 } });
const label = (slide, text, x, y, w, color) => T(slide, text, { x, y, w, h: 0.3, fontSize: 11, bold: true, charSpacing: 3, color: color || C.accent2 });

pres.addSection({ title: "Introduction" });

// 1 — Title
{
  const s = pres.addSlide({ masterName: "Title", sectionTitle: "Introduction" });
  addPhoto(s, true);
  label(s, "MOSCOW REGIONAL PEDAGOGICAL INSTITUTE", 0.7, 0.8, 5.6, C.accent1);
  s.addText("HISTORY OF\nMY UNIVERSITY", { placeholder: "title", fontSize: 46, charSpacing: 2 });
  T(s, "1931 – 1940", { x: 0.7, y: 3.55, w: 5.5, h: 0.9, fontFace: SCRIPT, fontSize: 34, color: C.accent1 });
  label(s, "PRESENTED BY", 0.7, 5.0, 5.6, C.accent1);
  T(s, "Margarita Kondakova\nElizaveta Vashchina\nAlexandra Abdulmanova", { x: 0.7, y: 5.35, w: 5.6, h: 1.3, fontSize: 16, color: C.background1, paraSpaceAfter: 2 });
}

pres.addSection({ title: "The First Decade" });
const SEC = "The First Decade";

// 2 — How It All Began
{
  const s = pres.addSlide({ masterName: "Photo Left", sectionTitle: SEC });
  addPhoto(s);
  T(s, "1931", { x: 5.7, y: 0.05, w: 7.1, h: 2.2, fontFace: THEME.headFontFace, fontSize: 150, color: C.background2, align: "right", objectName: "Decor 1931" });
  s.addText("How It All Began", { placeholder: "title" });
  label(s, "THE BEGINNING", 5.7, 1.75, 7.0);
  T(s, "On June 1, 1931 our university was founded. At first it was called the Moscow Regional Industrial-Pedagogical Institute. Later it got a simpler name — the Moscow Regional Pedagogical Institute (MOPI).", { x: 5.7, y: 2.1, w: 7.0, h: 1.6, fontSize: 16, color: C.text1 });
  label(s, "WHY IT WAS NEEDED", 5.7, 3.95, 7.0);
  T(s, "The new institute appeared because the country badly needed teachers. In 1932, the Moscow region introduced universal seven-year education, so schools needed many qualified teachers. The government also wanted MOPI to become a model pedagogical university for other regions.", { x: 5.7, y: 4.3, w: 7.0, h: 2.2, fontSize: 16, color: C.text1 });
}

// 3 — Directors of MOPI
{
  const s = pres.addSlide({ masterName: "Rose Panel", sectionTitle: SEC });
  T(s, "MO\nPI", { x: 0.45, y: 0.55, w: 3.9, h: 5.0, fontFace: THEME.headFontFace, fontSize: 150, color: C.background1, lineSpacingMultiple: 0.85, objectName: "Decor MOPI" });
  label(s, "LEADERSHIP  ·  1931–1941", 0.55, 6.35, 3.8, C.background1);
  s.addText("Directors of MOPI", { placeholder: "title" });
  T(s, "The leadership changed quite often, which reflected the difficult political times.", { x: 5.3, y: 1.5, w: 7.3, h: 0.8, fontSize: 16, italic: true, color: C.text2 });
  s.addShape(pres.shapes.LINE, { x: 5.45, y: 2.75, w: 0, h: 3.0, line: { color: C.accent3, width: 1.5 }, objectName: "Timeline" });
  const rows = [
    ["1931", "Afanasy Vasilyevich Shulgin", "first director"],
    ["1935–1936", "A. A. Savrasova", ""],
    ["1938–1941", "D. A. Allakhverdyan", ""],
  ];
  rows.forEach(([yr, name, note], i) => {
    const y = 2.6 + i * 1.3;
    s.addShape(pres.shapes.OVAL, { x: 5.33, y: y + 0.14, w: 0.24, h: 0.24, fill: { color: C.accent2 }, line: { color: C.background1, width: 2 }, objectName: `Timeline dot ${i + 1}` });
    T(s, yr, { x: 5.85, y, w: 2.5, h: 0.55, fontFace: THEME.headFontFace, fontSize: 28, color: C.accent2 });
    T(s, name, { x: 8.4, y: y + 0.08, w: 4.4, h: 0.4, fontSize: 18, bold: true, color: C.text1 });
    if (note) T(s, note, { x: 8.4, y: y + 0.5, w: 4.4, h: 0.35, fontSize: 14, italic: true, color: C.text2 });
  });
}

// 4 — First Faculties
{
  const s = pres.addSlide({ masterName: "Photo Diagonal", sectionTitle: SEC });
  addPhoto(s);
  s.addShape(pres.shapes.RIGHT_TRIANGLE, { x: 6.39, y: -0.01, w: 2.3, h: 7.52, flipV: true, fill: { color: C.background1 }, line: { color: C.background1, width: 0 }, objectName: "Diagonal cut" });
  s.addShape(pres.shapes.LINE, { x: 6.55, y: 0, w: 2.2, h: 7.5, flipH: true, line: { color: C.accent1, width: 3 }, objectName: "Diagonal line" });
  s.addText("First Faculties", { placeholder: "title" });
  T(s, "At the start, the institute had three faculties:", { x: 0.7, y: 1.5, w: 5.6, h: 0.4, fontSize: 16, color: C.text2 });
  const fac = [["Social and Literary", "with a history department"], ["Physics and Mathematics", ""], ["Chemistry and Technology", ""]];
  fac.forEach(([n, sub], i) => {
    const y = 2.2 + i * 0.95;
    T(s, `0${i + 1}`, { x: 0.7, y, w: 0.9, h: 0.6, fontFace: THEME.headFontFace, fontSize: 32, color: C.accent1 });
    T(s, n, { x: 1.65, y: y + 0.1, w: 4.6, h: 0.4, fontSize: 19, bold: true, color: C.text1 });
    if (sub) T(s, sub, { x: 1.65, y: y + 0.5, w: 4.6, h: 0.3, fontSize: 14, italic: true, color: C.text2 });
  });
  [["12", "departments"], ["1", "methodical office"]].forEach(([big, small], i) => {
    const x = 0.7 + i * 2.8;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 5.2, w: 2.6, h: 1.25, fill: { color: C.background2 }, line: { color: C.background2, width: 0 }, objectName: `Stat card ${i + 1}` });
    T(s, big, { x: x + 0.25, y: 5.3, w: 2.1, h: 0.65, fontFace: THEME.headFontFace, fontSize: 36, color: C.accent2 });
    T(s, small, { x: x + 0.25, y: 5.95, w: 2.2, h: 0.35, fontSize: 14, color: C.text1 });
  });
}

// 5 — Growth in 1932–1935
{
  const s = pres.addSlide({ masterName: "Title Only", sectionTitle: SEC });
  T(s, "1932", { x: 6.0, y: 0.05, w: 6.9, h: 2.0, fontFace: THEME.headFontFace, fontSize: 130, color: C.background2, align: "right", objectName: "Decor 1932" });
  s.addText("Growth in 1932–1935", { placeholder: "title" });
  T(s, "The institute grew quickly.", { x: 0.7, y: 1.45, w: 7, h: 0.4, fontSize: 16, italic: true, color: C.text2 });
  label(s, "BY 1933 — SIX FULL-TIME FACULTIES", 0.7, 2.15, 6.7);
  ["Literature", "Geography", "Physics", "Chemistry", "Economics", "History"].forEach((f, i) => {
    const x = 0.7 + (i % 3) * 2.3, y = 2.6 + Math.floor(i / 3) * 1.85;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.1, h: 1.65, fill: { color: C.background2 }, line: { color: C.background2, width: 0 }, objectName: `Faculty ${f}` });
    T(s, `0${i + 1}`, { x: x + 0.2, y: y + 0.18, w: 1, h: 0.35, fontFace: THEME.headFontFace, fontSize: 16, color: C.accent2 });
    T(s, f, { x: x + 0.2, y: y + 1.0, w: 1.8, h: 0.45, fontFace: THEME.headFontFace, fontSize: 20, color: C.text1 });
  });
  const cards = [
    ["1932", "Correspondence department opened", "People could become teachers without leaving their jobs."],
    ["22", "First graduates, 1934/35", "All from the History faculty — the number was small because the university was still very young."],
  ];
  cards.forEach(([big, head, body], i) => {
    const y = 2.15 + i * 2.15;
    s.addShape(pres.shapes.RECTANGLE, { x: 7.95, y, w: 4.68, h: 1.95, fill: { color: C.accent2 }, line: { color: C.accent2, width: 0 }, objectName: `Growth card ${i + 1}` });
    T(s, big, { x: 8.25, y: y + 0.18, w: 1.5, h: 0.75, fontFace: THEME.headFontFace, fontSize: 40, color: C.background1 });
    T(s, head, { x: 9.75, y: y + 0.3, w: 2.7, h: 0.6, fontSize: 15, bold: true, color: C.background1, valign: "middle" });
    T(s, body, { x: 8.25, y: y + 1.0, w: 4.15, h: 0.85, fontSize: 14, color: C.background1 });
  });
}

// 6 — Famous Professors
{
  const s = pres.addSlide({ masterName: "Photo Left", sectionTitle: SEC });
  addPhoto(s);
  s.addText("Famous Professors", { placeholder: "title" });
  T(s, "Despite political pressure, MOPI had a strong teaching staff. Famous historians worked here:", { x: 5.7, y: 1.45, w: 7.0, h: 0.65, fontSize: 15, color: C.text2 });
  const profs = [
    ["N. L. Rubinstein", "head of the History of the USSR department"],
    ["B. A. Rybakov", "future academician, worked at MOPI from 1934 to 1952"],
    ["V. M. Khvostov", "head of the Modern History department"],
    ["B. F. Porshnev", "head of Ancient and Medieval History"],
    ["A. V. Shestakov", "author of a school textbook on USSR history"],
  ];
  profs.forEach(([n, role], i) => {
    const y = 2.25 + i * 0.68;
    if (i > 0) s.addShape(pres.shapes.LINE, { x: 5.7, y: y - 0.06, w: 7.0, h: 0, line: { color: C.accent3, width: 0.75 }, objectName: `Row rule ${i}` });
    T(s, `0${i + 1}`, { x: 5.7, y: y + 0.02, w: 0.6, h: 0.5, fontFace: THEME.headFontFace, fontSize: 22, color: C.accent1 });
    T(s, n, { x: 6.35, y: y + 0.08, w: 2.45, h: 0.4, fontSize: 16, bold: true, color: C.text1 });
    T(s, role, { x: 8.85, y: y + 0.05, w: 3.85, h: 0.55, fontSize: 14, color: C.text2 });
  });
  T(s, "Students remembered these professors as brilliant teachers.", { x: 5.7, y: 5.85, w: 7.0, h: 0.5, fontFace: THEME.headFontFace, fontSize: 19, italic: true, color: C.accent2 });
}

// 7 — 1937–1939: New Steps
{
  const s = pres.addSlide({ masterName: "Photo Right", sectionTitle: SEC });
  addPhoto(s);
  s.addText("1937–1939: New Steps", { placeholder: "title" });
  const cols = [
    ["FIRST ACADEMIC JOURNAL", "1937", "Uchyonye Zapiski", "The institute started publishing its own academic journal, “Uchyonye Zapiski.”"],
    ["POSTGRADUATE STUDIES", "1939", "Aspirantura", "Postgraduate studies opened. This was an important step for training young scientists."],
  ];
  cols.forEach(([lab, yr, name, body], i) => {
    const x = 0.7 + i * 3.85;
    label(s, lab, x, 1.75, 3.6);
    T(s, yr, { x, y: 2.05, w: 3.5, h: 1.25, fontFace: THEME.headFontFace, fontSize: 80, color: C.accent1 });
    T(s, name, { x, y: 3.4, w: 3.5, h: 0.5, fontFace: THEME.headFontFace, fontSize: 24, italic: true, color: C.text1 });
    T(s, body, { x, y: 4.05, w: 3.45, h: 1.6, fontSize: 16, color: C.text1 });
  });
}

// 8 — Results of the First Decade
{
  const s = pres.addSlide({ masterName: "Title Only Blush", sectionTitle: SEC });
  s.addText("Results of the First Decade", { placeholder: "title" });
  const stats = [
    ["945", "teachers graduated", "from the History faculty alone, 1931–1941"],
    ["2,582", "students", "studied at MOPI by June 1941"],
    ["1931", "library founded", "it grew together with the institute"],
  ];
  stats.forEach(([big, head, body], i) => {
    const x = 0.7 + i * 4.1;
    T(s, big, { x, y: 1.75, w: 3.8, h: 1.15, fontFace: THEME.headFontFace, fontSize: 72, color: C.accent2 });
    T(s, head, { x, y: 3.0, w: 3.8, h: 0.4, fontSize: 18, bold: true, color: C.text1 });
    T(s, body, { x, y: 3.42, w: 3.6, h: 0.7, fontSize: 15, color: C.text2 });
  });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 4.65, w: 11.93, h: 1.75, fill: { color: C.background1 }, line: { color: C.background1, width: 0 }, shadow: { type: "outer", color: "9E6475", opacity: 0.15, blur: 12, offset: 3, angle: 90 }, objectName: "Summary card" });
  T(s, [
    { text: "Together with other faculties the number was much bigger. ", options: { color: C.text1 } },
    { text: "MOPI became one of the leading centres for teacher training in the country.", options: { color: C.accent2, bold: true } },
  ], { x: 1.1, y: 4.85, w: 11.1, h: 1.35, fontSize: 19, valign: "middle", fontFace: THEME.headFontFace });
}

pres.addSection({ title: "1941" });

// 9 — 1941: The War Begins
{
  const s = pres.addSlide({ masterName: "Dark Photo Right", sectionTitle: "1941" });
  addPhoto(s, true);
  s.addText("1941: The War Begins", { placeholder: "title" });
  T(s, "October 15, 1941", { x: 0.7, y: 1.4, w: 6.5, h: 0.6, fontFace: SCRIPT, fontSize: 24, color: C.accent1 });
  T(s, "Classes stopped. The institute was evacuated. Students marched to Murom, and later professors and teachers were moved to the town of Malmyzh in the Kirov region.", { x: 0.7, y: 2.1, w: 6.8, h: 1.1, fontSize: 16, color: SOFT_WHITE });
  const stops = [["Moscow", "classes stop"], ["Murom", "students march here"], ["Malmyzh", "Kirov region"]];
  s.addShape(pres.shapes.LINE, { x: 0.84, y: 3.64, w: 5.0, h: 0, line: { color: C.accent1, width: 1.5, dashType: "dash" }, objectName: "Route line" });
  stops.forEach(([c, sub], i) => {
    const x = 0.7 + i * 2.5;
    s.addShape(pres.shapes.OVAL, { x, y: 3.5, w: 0.28, h: 0.28, fill: { color: C.accent1 }, line: { color: C.text1, width: 2 }, objectName: `Route stop ${c}` });
    T(s, c, { x, y: 3.9, w: 2.3, h: 0.4, fontSize: 17, bold: true, color: C.background1 });
    T(s, sub, { x, y: 4.28, w: 2.3, h: 0.3, fontSize: 13, color: C.accent1 });
  });
  [["264", "full-time students remained by the start of 1941/42"], ["273", "students arrived in Malmyzh"], ["26", "teachers arrived in Malmyzh"]].forEach(([big, body], i) => {
    const x = 0.7 + i * 2.5;
    T(s, big, { x, y: 4.95, w: 2.3, h: 0.85, fontFace: THEME.headFontFace, fontSize: 48, color: C.accent1 });
    T(s, body, { x, y: 5.8, w: 2.2, h: 0.75, fontSize: 14, color: SOFT_WHITE });
  });
}

// 10 — Closing
{
  const s = pres.addSlide({ masterName: "Dark Photo Left", sectionTitle: "1941" });
  addPhoto(s, true);
  label(s, "TO BE CONTINUED", 5.9, 1.55, 6.7, C.accent1);
  T(s, "But that is already a different page of our history —", { x: 5.9, y: 2.0, w: 6.7, h: 2.1, fontFace: THEME.headFontFace, fontSize: 36, italic: true, color: C.background1 });
  T(s, "the war years.", { x: 5.9, y: 3.7, w: 6.7, h: 1.0, fontFace: SCRIPT, fontSize: 36, color: C.accent1 });
  T(s, "Margarita Kondakova  ·  Elizaveta Vashchina  ·  Alexandra Abdulmanova", { x: 5.9, y: 6.4, w: 6.9, h: 0.35, fontSize: 12, color: SOFT_WHITE });
}

// pptxgenjs never writes type="pic" for picture placeholders, so PowerPoint
// would treat the photo frames as text boxes. Find the frames by their prompt
// text in each layout and mark them (and the slide copies) as pictures.
const PROMPT = "Click the icon to add a photo";
async function markPicturePlaceholders(file) {
  const fs = require("fs");
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const setPic = (xml, idx) => xml.replace(new RegExp(`<p:ph\\s+idx="${idx}"`), `<p:ph type="pic" idx="${idx}"`);
  const picIdx = {};
  for (const name of Object.keys(zip.files).filter((n) => /slideLayouts\/slideLayout\d+\.xml$/.test(n))) {
    let xml = await zip.file(name).async("string");
    const ids = (xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || []).filter((sp) => sp.includes(PROMPT)).map((sp) => sp.match(/<p:ph\s+idx="(\d+)"/)[1]);
    ids.forEach((idx) => (xml = setPic(xml, idx)));
    picIdx[name.split("/").pop()] = ids;
    zip.file(name, xml);
  }
  for (const name of Object.keys(zip.files).filter((n) => /slides\/slide\d+\.xml$/.test(n))) {
    const rels = await zip.file(name.replace("slides/", "slides/_rels/") + ".rels").async("string");
    const layout = rels.match(/slideLayouts\/(slideLayout\d+\.xml)/)[1];
    let xml = await zip.file(name).async("string");
    (picIdx[layout] || []).forEach((idx) => (xml = setPic(xml, idx)));
    zip.file(name, xml);
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await markPicturePlaceholders(OUT);
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
