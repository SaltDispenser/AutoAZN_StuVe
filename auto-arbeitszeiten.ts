import { isHoliday } from "feiertagejs";
import { PDFDocument } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";

// Type definitions
interface WorkEntry {
  month: number;
  weekNumber: number;
  activity: string;
  date: string;
  dateObj: Date;
  start: string;
  end: string;
  total: string;
}

interface HoursPerMonth {
  [month: string]: number;
}

interface UserConfig {
  year: number;
  name: string;
  department: string;
  signatureImage: string;
  outputFolder?: string;
  maxHoursPerMonth?: number;
  activities: ActivityConfig[];
}

interface ActivityConfig {
  name: string;
  weight: number;
}

// Helper function: Check if date is weekend
function isWeekend(date: Date): boolean {
  const day: number = date.getDay();
  return day === 0 || day === 6;
}

// Helper function: Calculate week number
function getWeekNumber(date: Date): number {
  const d: Date = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum: number = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart: Date = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Helper function: Format date
function formatDate(date: Date): string {
  const day: string = String(date.getDate()).padStart(2, "0");
  const month: string = String(date.getMonth() + 1).padStart(2, "0");
  const year: number = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function normalizeActivities(rawActivities: unknown): ActivityConfig[] {
  if (!Array.isArray(rawActivities) || rawActivities.length === 0) {
    throw new Error(
      "In user-config/config.json fehlt das Feld 'activities' oder es ist leer.",
    );
  }

  return rawActivities.map((activity, index) => {
    if (typeof activity === "string") {
      const name = activity.trim();
      if (name === "") {
        throw new Error(`Activity ${index + 1} ist leer.`);
      }
      return { name, weight: 1 };
    }

    if (
      typeof activity !== "object" ||
      activity === null ||
      typeof (activity as { name?: unknown }).name !== "string"
    ) {
      throw new Error(
        `Activity ${index + 1} muss ein String oder ein Objekt mit name/weight sein.`,
      );
    }

    const name = (activity as { name: string }).name.trim();
    const weight = (activity as { weight?: unknown }).weight;

    if (name === "") {
      throw new Error(`Activity ${index + 1} hat keinen gültigen Namen.`);
    }
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
      throw new Error(
        `Activity ${index + 1} (${name}) braucht ein positives numerisches weight.`,
      );
    }

    return { name, weight };
  });
}

function loadUserConfig(): UserConfig {
  const configPath = path.resolve("user-config", "config.json");

  if (!fs.existsSync(configPath)) {
    throw new Error("Konfigurationsdatei fehlt: user-config/config.json");
  }

  const rawConfig = fs.readFileSync(configPath, "utf8");
  const parsedConfig: Partial<UserConfig> = JSON.parse(rawConfig);

  if (typeof parsedConfig.year !== "number") {
    throw new Error("In user-config/config.json fehlt das Feld 'year'.");
  }
  if (
    typeof parsedConfig.name !== "string" ||
    parsedConfig.name.trim() === ""
  ) {
    throw new Error("In user-config/config.json fehlt das Feld 'name'.");
  }
  if (
    typeof parsedConfig.department !== "string" ||
    parsedConfig.department.trim() === ""
  ) {
    throw new Error("In user-config/config.json fehlt das Feld 'department'.");
  }
  if (
    typeof parsedConfig.signatureImage !== "string" ||
    parsedConfig.signatureImage.trim() === ""
  ) {
    throw new Error(
      "In user-config/config.json fehlt das Feld 'signatureImage'.",
    );
  }
  return {
    year: parsedConfig.year,
    name: parsedConfig.name,
    department: parsedConfig.department,
    signatureImage: parsedConfig.signatureImage,
    outputFolder: parsedConfig.outputFolder,
    maxHoursPerMonth: parsedConfig.maxHoursPerMonth,
    activities: normalizeActivities(parsedConfig.activities),
  };
}

// Helper function: Calculate hours for day
function calculateDailyHours(remainingHours: number): number {
  switch (true) {
    case remainingHours >= 4:
      return [3, 4][Math.floor(Math.random() * 2)]!;
    case remainingHours >= 3:
      return 3;
    case remainingHours >= 2:
      return 2;
    default:
      return 1;
  }
}

// Helper function: Get working days for month
function getWorkingDays(year: number, month: number): Date[] {
  const workingDays: Date[] = [];
  const daysInMonth: number = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date: Date = new Date(year, month, day);
    if (!isWeekend(date) && !isHoliday(date, "BW")) {
      workingDays.push(date);
    }
  }

  return workingDays;
}

// Helper function: Generate work entry
function createWorkEntry(
  date: Date,
  activity: string,
  hours: number,
): WorkEntry {
  const startHour: number = 9 + Math.floor(Math.random() * 5);
  const endHour: number = startHour + hours;

  return {
    month: date.getMonth() + 1,
    weekNumber: getWeekNumber(date),
    activity,
    date: formatDate(date),
    dateObj: date,
    start: `${String(startHour).padStart(2, "0")}:00`,
    end: `${String(endHour).padStart(2, "0")}:00`,
    total: hours.toFixed(1),
  };
}

// Generate work hours
function generateWorkHours(
  year: number = new Date().getFullYear(),
  maxHoursPerMonth: number = 10,
  activities: ActivityConfig[],
): WorkEntry[] {
  const workHours: WorkEntry[] = [];

  // For each month
  for (let month = 0; month < 12; month++) {
    let hoursInMonth: number = 0;
    const workingDays: Date[] = getWorkingDays(year, month);

    // Shuffle working days randomly
    workingDays.sort(() => Math.random() - 0.5);

    while (hoursInMonth < maxHoursPerMonth && workingDays.length > 0) {
      const date: Date = workingDays.shift()!;
      const remainingHours: number = maxHoursPerMonth - hoursInMonth;
      const dailyHours: number = calculateDailyHours(remainingHours);
      const activity: string = pickWeightedActivity(activities);

      workHours.push(createWorkEntry(date, activity, dailyHours));
      hoursInMonth += dailyHours;
    }
  }

  return workHours;
}

const USER_CONFIG: UserConfig = loadUserConfig();
const workHours: WorkEntry[] = generateWorkHours(
  USER_CONFIG.year,
  USER_CONFIG.maxHoursPerMonth ?? 10,
  USER_CONFIG.activities,
);

function pickWeightedActivity(activities: ActivityConfig[]): string {
  const totalWeight = activities.reduce(
    (sum, activity) => sum + activity.weight,
    0,
  );
  let roll = Math.random() * totalWeight;

  for (const activity of activities) {
    roll -= activity.weight;
    if (roll < 0) {
      return activity.name;
    }
  }

  return activities[activities.length - 1]!.name;
}

//helper function to load PDF template
async function loadPDFTemplate(): Promise<PDFDocument> {
  const templateFile = "./formular_arbeitszeiterfassung_referenten.pdf";
  const existingPdfBytes = fs.readFileSync(templateFile);
  return await PDFDocument.load(existingPdfBytes);
}

// Helper function: Fill PDF with work entries
async function fillPDF(workEntries: WorkEntry[]): Promise<void> {
  const TOTAL_MONTHS = 12;
  const STARTING_MONTH = 1;
  const CURRENT_YEAR = USER_CONFIG.year;
  const NAME = USER_CONFIG.name;
  const DEPARTMENT = USER_CONFIG.department;
  const OUTPUT_FOLDER = USER_CONFIG.outputFolder ?? String(CURRENT_YEAR);
  const MAX_HOURS = USER_CONFIG.maxHoursPerMonth ?? 10;

  if (!fs.existsSync(OUTPUT_FOLDER)) {
    fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
  }

  for (let index = 0; index < TOTAL_MONTHS; index++) {
    const pdfDoc = await loadPDFTemplate();
    const form = pdfDoc.getForm();
    const currentMonth = index + STARTING_MONTH;

    form.getTextField("name").setText(NAME);
    form.getTextField("year").setText(CURRENT_YEAR.toString());
    form.getTextField("ref").setText(DEPARTMENT);
    form.getTextField("month").setText(currentMonth.toString());
    form.getTextField("hours_total").setText(MAX_HOURS.toString());

    const monthEntries = workEntries.filter(
      (entry) => entry.month === currentMonth,
    );

    // Group entries by week number
    const entriesByWeek = new Map<number, WorkEntry[]>();
    for (const entry of monthEntries) {
      if (!entriesByWeek.has(entry.weekNumber)) {
        entriesByWeek.set(entry.weekNumber, []);
      }
      entriesByWeek.get(entry.weekNumber)!.push(entry);
    }
    const sortedWeeks = Array.from(entriesByWeek.keys()).sort((a, b) => a - b);

    sortedWeeks.forEach((weekNumber, kwIndex) => {
      if (kwIndex >= 5) return;
      const kwSlot = kwIndex + 1;
      form.getTextField(`kw${kwSlot}`).setText(weekNumber.toString());

      const weekEntries = entriesByWeek.get(weekNumber)!;
      weekEntries.forEach((entry, entryIndex) => {
        if (entryIndex >= 5) return;
        const slot = entryIndex + 1;
        const setField = (name: string, value: string) => {
          try {
            form.getTextField(name).setText(value);
          } catch {}
        };
        setField(`kw${kwSlot}_activity${slot}`, entry.activity);
        setField(`kw${kwSlot}_date${slot}`, entry.date);
        setField(`kw${kwSlot}_start${slot}`, entry.start);
        setField(`kw${kwSlot}_end${slot}`, entry.end);
        setField(`kw${kwSlot}_total${slot}`, entry.total);
      });
    });

    await applyAutomaticSignature(
      pdfDoc,
      form,
      new Date(CURRENT_YEAR, currentMonth, 0),
      USER_CONFIG.signatureImage,
    );

    const outputFilename = `${OUTPUT_FOLDER}/arbeitszeiten_${currentMonth}.pdf`;
    await saveAsNewPDF(pdfDoc, outputFilename);
  }
}

async function applyAutomaticSignature(
  pdfDoc: PDFDocument,
  form: ReturnType<PDFDocument["getForm"]>,
  signatureDate: Date,
  signatureImageName: string,
): Promise<void> {
  const signatureField = form.getSignature("sig_signature");
  const widgets = signatureField.acroField.getWidgets();

  if (widgets.length === 0) {
    throw new Error("Signaturfeld 'sig_signature' hat keine Widget-Position.");
  }

  const widget = widgets[0]!;
  const rect = widget.getRectangle();
  const pageRef = widget.P();

  if (!pageRef) {
    throw new Error(
      "Signaturfeld 'sig_signature' ist keiner Seite zugeordnet.",
    );
  }

  const page = pdfDoc
    .getPages()
    .find((candidate) => candidate.ref.toString() === pageRef.toString());
  if (!page) {
    throw new Error(
      "Signaturseite für 'sig_signature' konnte nicht gefunden werden.",
    );
  }

  const signatureImagePath = resolveSignatureImagePath(signatureImageName);
  if (!signatureImagePath) {
    throw new Error(
      "Keine Signaturdatei gefunden. Lege sie in user-config ab.",
    );
  }

  const signatureBytes = fs.readFileSync(signatureImagePath);
  const extension = path.extname(signatureImagePath).toLowerCase();
  const signatureImage =
    extension === ".jpg" || extension === ".jpeg"
      ? await pdfDoc.embedJpg(signatureBytes)
      : await pdfDoc.embedPng(signatureBytes);
  const scale = Math.max(
    rect.width / signatureImage.width,
    rect.height / signatureImage.height,
  );
  const dims = signatureImage.scale(scale);

  page.drawImage(signatureImage, {
    x: rect.x + (rect.width - dims.width) / 2,
    y: rect.y + (rect.height - dims.height) / 2,
    width: dims.width,
    height: dims.height,
  });

  form.getTextField("sig_date").setText(formatDate(signatureDate));
}

function resolveSignatureImagePath(
  signatureImageName: string,
): string | undefined {
  const signaturePath = path.resolve("user-config", signatureImageName);
  if (fs.existsSync(signaturePath)) {
    return signaturePath;
  }

  return undefined;
}

// Helper function: Save PDF to file
async function saveAsNewPDF(
  pdfDoc: PDFDocument,
  filename: string,
): Promise<void> {
  const outputDir = filename.split(/[/\\]/).slice(0, -1).join("\\");
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(filename, pdfBytes);
}

// Fill PDF with generated work hours
fillPDF(workHours)
  .then(() => {
    console.log("PDFs wurden erfolgreich erstellt.");
  })
  .catch((error: unknown) => {
    console.error("Fehler beim Erstellen der PDFs:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (fs.existsSync("./temp.pdf")) {
      fs.unlinkSync("./temp.pdf");
    }
  });
