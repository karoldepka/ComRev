import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "smol-toml";

const outputDir = path.resolve("assets", "motivation");
const schemaVersion = 1;

const languages = [
  { code: "en", name: "English" },
  { code: "zh", name: "Chinese" },
  { code: "hi", name: "Hindi" },
  { code: "es", name: "Spanish" },
  { code: "ar", name: "Arabic" },
  { code: "fr", name: "French" },
  { code: "bn", name: "Bengali" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ur", name: "Urdu" },
  { code: "id", name: "Indonesian" },
  { code: "de", name: "German" },
  { code: "ja", name: "Japanese" },
  { code: "pl", name: "Polish" },
  { code: "ca", name: "Catalan" },
];

const itemTypes = [
  "Quote",
  "Mantra",
  "Quality",
  "Value",
  "Affirmation",
  "Slogan",
];

const localizedItems = {
  en: [
    ["Quote", "Small promises kept daily become a life you can trust.", "Structable Studio"],
    ["Mantra", "Begin again, calmly and completely.", "Structable Studio"],
    ["Quality", "Discipline with warmth.", "Structable Studio"],
    ["Value", "Progress over performance theater.", "Structable Studio"],
    ["Affirmation", "I can do the next honest step.", "Structable Studio"],
    ["Slogan", "Build the day before it builds you.", "Structable Studio"],
    ["Quote", "Attention is the first form of courage.", "Structable Studio"],
    ["Mantra", "Less hurry, more power.", "Structable Studio"],
    ["Quality", "Patient ambition.", "Structable Studio"],
    ["Value", "Truth that helps action.", "Structable Studio"],
  ],
  zh: [
    ["Quote", "每天守住小承诺，人生就会变得可靠。", "Structable Studio"],
    ["Mantra", "平静而完整地重新开始。", "Structable Studio"],
    ["Quality", "有温度的自律。", "Structable Studio"],
    ["Value", "重视进步，不表演努力。", "Structable Studio"],
    ["Affirmation", "我能迈出下一个诚实的步骤。", "Structable Studio"],
    ["Slogan", "先塑造今天，再让今天塑造你。", "Structable Studio"],
    ["Quote", "专注是勇气的第一种形式。", "Structable Studio"],
    ["Mantra", "少一点匆忙，多一点力量。", "Structable Studio"],
    ["Quality", "耐心的雄心。", "Structable Studio"],
    ["Value", "能推动行动的真相。", "Structable Studio"],
  ],
  hi: [
    ["Quote", "हर दिन निभाए छोटे वादे जीवन को भरोसेमंद बनाते हैं।", "Structable Studio"],
    ["Mantra", "शांत होकर, पूरा मन लगाकर फिर शुरू करो।", "Structable Studio"],
    ["Quality", "गर्मजोशी के साथ अनुशासन।", "Structable Studio"],
    ["Value", "दिखावे से पहले वास्तविक प्रगति।", "Structable Studio"],
    ["Affirmation", "मैं अगला सच्चा कदम उठा सकता हूँ।", "Structable Studio"],
    ["Slogan", "दिन को गढ़ो, फिर दिन तुम्हें गढ़ेगा।", "Structable Studio"],
    ["Quote", "ध्यान साहस का पहला रूप है।", "Structable Studio"],
    ["Mantra", "कम जल्दबाजी, अधिक शक्ति।", "Structable Studio"],
    ["Quality", "धैर्यवान महत्वाकांक्षा।", "Structable Studio"],
    ["Value", "ऐसा सत्य जो कार्रवाई में मदद करे।", "Structable Studio"],
  ],
  es: [
    ["Quote", "Las pequeñas promesas cumplidas cada día crean una vida en la que confiar.", "Structable Studio"],
    ["Mantra", "Empieza de nuevo, con calma y por completo.", "Structable Studio"],
    ["Quality", "Disciplina con calidez.", "Structable Studio"],
    ["Value", "Progreso antes que teatro de rendimiento.", "Structable Studio"],
    ["Affirmation", "Puedo dar el siguiente paso honesto.", "Structable Studio"],
    ["Slogan", "Construye el día antes de que el día te construya.", "Structable Studio"],
    ["Quote", "La atención es la primera forma de valentía.", "Structable Studio"],
    ["Mantra", "Menos prisa, más poder.", "Structable Studio"],
    ["Quality", "Ambición paciente.", "Structable Studio"],
    ["Value", "Verdad que ayuda a actuar.", "Structable Studio"],
  ],
  ar: [
    ["Quote", "الوعود الصغيرة التي نفي بها كل يوم تصنع حياة يمكن الوثوق بها.", "Structable Studio"],
    ["Mantra", "ابدأ من جديد بهدوء وبكامل حضورك.", "Structable Studio"],
    ["Quality", "انضباط بدفء.", "Structable Studio"],
    ["Value", "التقدم قبل استعراض الأداء.", "Structable Studio"],
    ["Affirmation", "أستطيع اتخاذ الخطوة الصادقة التالية.", "Structable Studio"],
    ["Slogan", "اصنع يومك قبل أن يصنعك يومك.", "Structable Studio"],
    ["Quote", "الانتباه هو أول أشكال الشجاعة.", "Structable Studio"],
    ["Mantra", "عجلة أقل، قوة أكثر.", "Structable Studio"],
    ["Quality", "طموح صبور.", "Structable Studio"],
    ["Value", "حقيقة تساعد على الفعل.", "Structable Studio"],
  ],
  fr: [
    ["Quote", "Les petites promesses tenues chaque jour deviennent une vie fiable.", "Structable Studio"],
    ["Mantra", "Recommence, calmement et entièrement.", "Structable Studio"],
    ["Quality", "Discipline avec chaleur.", "Structable Studio"],
    ["Value", "Le progrès avant le théâtre de la performance.", "Structable Studio"],
    ["Affirmation", "Je peux faire le prochain pas honnête.", "Structable Studio"],
    ["Slogan", "Construis la journée avant qu'elle ne te construise.", "Structable Studio"],
    ["Quote", "L'attention est la première forme de courage.", "Structable Studio"],
    ["Mantra", "Moins de hâte, plus de puissance.", "Structable Studio"],
    ["Quality", "Ambition patiente.", "Structable Studio"],
    ["Value", "Une vérité qui aide à agir.", "Structable Studio"],
  ],
  bn: [
    ["Quote", "প্রতিদিন রাখা ছোট প্রতিশ্রুতি এক বিশ্বাসযোগ্য জীবন গড়ে।", "Structable Studio"],
    ["Mantra", "শান্তভাবে, সম্পূর্ণ মন দিয়ে আবার শুরু করো।", "Structable Studio"],
    ["Quality", "উষ্ণতার সঙ্গে শৃঙ্খলা।", "Structable Studio"],
    ["Value", "দেখানো নয়, আগে অগ্রগতি।", "Structable Studio"],
    ["Affirmation", "আমি পরের সৎ পদক্ষেপ নিতে পারি।", "Structable Studio"],
    ["Slogan", "দিনকে গড়ো, তারপর দিন তোমাকে গড়বে।", "Structable Studio"],
    ["Quote", "মনোযোগ সাহসের প্রথম রূপ।", "Structable Studio"],
    ["Mantra", "কম তাড়া, বেশি শক্তি।", "Structable Studio"],
    ["Quality", "ধৈর্যশীল উচ্চাকাঙ্ক্ষা।", "Structable Studio"],
    ["Value", "যে সত্য কাজ করতে সাহায্য করে।", "Structable Studio"],
  ],
  pt: [
    ["Quote", "Pequenas promessas cumpridas todos os dias criam uma vida confiável.", "Structable Studio"],
    ["Mantra", "Comece de novo, com calma e por inteiro.", "Structable Studio"],
    ["Quality", "Disciplina com calor humano.", "Structable Studio"],
    ["Value", "Progresso antes de teatro de desempenho.", "Structable Studio"],
    ["Affirmation", "Posso dar o próximo passo honesto.", "Structable Studio"],
    ["Slogan", "Construa o dia antes que o dia construa você.", "Structable Studio"],
    ["Quote", "A atenção é a primeira forma de coragem.", "Structable Studio"],
    ["Mantra", "Menos pressa, mais força.", "Structable Studio"],
    ["Quality", "Ambição paciente.", "Structable Studio"],
    ["Value", "Verdade que ajuda a agir.", "Structable Studio"],
  ],
  ru: [
    ["Quote", "Малые обещания, выполненные каждый день, создают жизнь, которой можно доверять.", "Structable Studio"],
    ["Mantra", "Начни снова: спокойно и полностью.", "Structable Studio"],
    ["Quality", "Дисциплина с теплом.", "Structable Studio"],
    ["Value", "Прогресс важнее показательной продуктивности.", "Structable Studio"],
    ["Affirmation", "Я могу сделать следующий честный шаг.", "Structable Studio"],
    ["Slogan", "Создай день до того, как день создаст тебя.", "Structable Studio"],
    ["Quote", "Внимание — первая форма смелости.", "Structable Studio"],
    ["Mantra", "Меньше спешки, больше силы.", "Structable Studio"],
    ["Quality", "Терпеливые амбиции.", "Structable Studio"],
    ["Value", "Правда, которая помогает действовать.", "Structable Studio"],
  ],
  ur: [
    ["Quote", "روز نبھائے گئے چھوٹے وعدے ایک قابل اعتماد زندگی بناتے ہیں۔", "Structable Studio"],
    ["Mantra", "پرسکون اور مکمل دل سے دوبارہ شروع کرو۔", "Structable Studio"],
    ["Quality", "گرمجوشی کے ساتھ نظم و ضبط۔", "Structable Studio"],
    ["Value", "نمائش سے پہلے حقیقی ترقی۔", "Structable Studio"],
    ["Affirmation", "میں اگلا سچا قدم اٹھا سکتا ہوں۔", "Structable Studio"],
    ["Slogan", "دن کو بناؤ، پھر دن تمہیں بنائے گا۔", "Structable Studio"],
    ["Quote", "توجہ ہمت کی پہلی شکل ہے۔", "Structable Studio"],
    ["Mantra", "کم جلدی، زیادہ طاقت۔", "Structable Studio"],
    ["Quality", "صابر بلند حوصلہ۔", "Structable Studio"],
    ["Value", "وہ سچ جو عمل میں مدد دے۔", "Structable Studio"],
  ],
  id: [
    ["Quote", "Janji kecil yang ditepati setiap hari membangun hidup yang bisa dipercaya.", "Structable Studio"],
    ["Mantra", "Mulai lagi dengan tenang dan utuh.", "Structable Studio"],
    ["Quality", "Disiplin dengan kehangatan.", "Structable Studio"],
    ["Value", "Kemajuan sebelum sandiwara performa.", "Structable Studio"],
    ["Affirmation", "Saya bisa mengambil langkah jujur berikutnya.", "Structable Studio"],
    ["Slogan", "Bangun harimu sebelum hari membangunmu.", "Structable Studio"],
    ["Quote", "Perhatian adalah bentuk pertama keberanian.", "Structable Studio"],
    ["Mantra", "Lebih sedikit tergesa, lebih banyak daya.", "Structable Studio"],
    ["Quality", "Ambisi yang sabar.", "Structable Studio"],
    ["Value", "Kebenaran yang membantu tindakan.", "Structable Studio"],
  ],
  de: [
    ["Quote", "Kleine Versprechen, die du täglich hältst, werden zu einem Leben, dem du vertrauen kannst.", "Structable Studio"],
    ["Mantra", "Beginne wieder, ruhig und ganz.", "Structable Studio"],
    ["Quality", "Disziplin mit Wärme.", "Structable Studio"],
    ["Value", "Fortschritt vor Leistungsinszenierung.", "Structable Studio"],
    ["Affirmation", "Ich kann den nächsten ehrlichen Schritt gehen.", "Structable Studio"],
    ["Slogan", "Baue den Tag, bevor der Tag dich baut.", "Structable Studio"],
    ["Quote", "Aufmerksamkeit ist die erste Form von Mut.", "Structable Studio"],
    ["Mantra", "Weniger Eile, mehr Kraft.", "Structable Studio"],
    ["Quality", "Geduldiger Ehrgeiz.", "Structable Studio"],
    ["Value", "Wahrheit, die Handeln ermöglicht.", "Structable Studio"],
  ],
  ja: [
    ["Quote", "毎日守る小さな約束が、信頼できる人生をつくる。", "Structable Studio"],
    ["Mantra", "落ち着いて、まるごと、もう一度始める。", "Structable Studio"],
    ["Quality", "温かさのある規律。", "Structable Studio"],
    ["Value", "演じる成果より、実際の前進。", "Structable Studio"],
    ["Affirmation", "私は次の誠実な一歩を踏み出せる。", "Structable Studio"],
    ["Slogan", "一日に作られる前に、一日を作ろう。", "Structable Studio"],
    ["Quote", "注意を向けることは、勇気の最初の形。", "Structable Studio"],
    ["Mantra", "急がず、力強く。", "Structable Studio"],
    ["Quality", "忍耐ある野心。", "Structable Studio"],
    ["Value", "行動を助ける真実。", "Structable Studio"],
  ],
  pl: [
    ["Quote", "Małe obietnice dotrzymywane codziennie tworzą życie, któremu możesz ufać.", "Structable Studio"],
    ["Mantra", "Zacznij od nowa, spokojnie i w całości.", "Structable Studio"],
    ["Quality", "Dyscyplina z ciepłem.", "Structable Studio"],
    ["Value", "Postęp zamiast teatru produktywności.", "Structable Studio"],
    ["Affirmation", "Mogę zrobić następny uczciwy krok.", "Structable Studio"],
    ["Slogan", "Zbuduj dzień, zanim dzień zbuduje ciebie.", "Structable Studio"],
    ["Quote", "Uwaga jest pierwszą formą odwagi.", "Structable Studio"],
    ["Mantra", "Mniej pośpiechu, więcej mocy.", "Structable Studio"],
    ["Quality", "Cierpliwa ambicja.", "Structable Studio"],
    ["Value", "Prawda, która pomaga działać.", "Structable Studio"],
  ],
  ca: [
    ["Quote", "Les petites promeses complertes cada dia creen una vida en què pots confiar.", "Structable Studio"],
    ["Mantra", "Torna a començar, amb calma i del tot.", "Structable Studio"],
    ["Quality", "Disciplina amb calidesa.", "Structable Studio"],
    ["Value", "Progrés abans que teatre de rendiment.", "Structable Studio"],
    ["Affirmation", "Puc fer el següent pas honest.", "Structable Studio"],
    ["Slogan", "Construeix el dia abans que el dia et construeixi.", "Structable Studio"],
    ["Quote", "L'atenció és la primera forma de coratge.", "Structable Studio"],
    ["Mantra", "Menys pressa, més força.", "Structable Studio"],
    ["Quality", "Ambició pacient.", "Structable Studio"],
    ["Value", "Veritat que ajuda a actuar.", "Structable Studio"],
  ],
};

const slideGroups = [[0], [1, 2], [3], [4, 5, 6], [7], [8, 9]];

function toItems(languageCode) {
  return localizedItems[languageCode].map(([type, text, authorName], index) => ({
    id: `${languageCode}_${type.toLowerCase()}_${String(index + 1).padStart(2, "0")}`,
    type,
    text,
    author_name: authorName,
  }));
}

function toSlides(languageCode, items) {
  return slideGroups.map((group, index) => {
    const groupedItems = group.map((itemIndex) => items[itemIndex]);
    return {
      id: `${languageCode}_slide_${String(index + 1).padStart(2, "0")}`,
      item_ids: groupedItems.map((item) => item.id),
      multiline: groupedItems.length > 1,
      text: groupedItems.map((item) => item.text).join("\n"),
    };
  });
}

function assertValidDocument(document, filename) {
  const parsed = parse(stringify(document));
  if (parsed.schema_version !== schemaVersion) {
    throw new Error(`${filename}: schema_version did not round-trip`);
  }
  if (parsed.items.length !== document.items.length) {
    throw new Error(`${filename}: item count did not round-trip`);
  }
  if (parsed.slides.length !== document.slides.length) {
    throw new Error(`${filename}: slide count did not round-trip`);
  }
}

await mkdir(outputDir, { recursive: true });

const manifest = {
  schema_version: schemaVersion,
  generated_by: "scripts/generate-motivational-content.mjs",
  parser_package: "smol-toml",
  item_types: itemTypes,
  languages,
};

for (const language of languages) {
  const items = toItems(language.code);
  const document = {
    schema_version: schemaVersion,
    language_code: language.code,
    language_name: language.name,
    generated_by: "scripts/generate-motivational-content.mjs",
    parser_package: "smol-toml",
    items,
    slides: toSlides(language.code, items),
  };
  const filename = `${language.code}.toml`;
  assertValidDocument(document, filename);
  await writeFile(path.join(outputDir, filename), stringify(document));
}

assertValidDocument({ ...manifest, items: [], slides: [] }, "manifest.toml");
await writeFile(path.join(outputDir, "manifest.toml"), stringify(manifest));

console.log(`Generated ${languages.length} TOML files in ${outputDir}`);
