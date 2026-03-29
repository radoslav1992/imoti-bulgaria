import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import {
  writeFileSync,
  existsSync,
  readFileSync,
  mkdirSync,
  readdirSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data", "daily");

const REQUEST_DELAY_MS = 1500;
const BASE_URL = "https://www.imot.bg/sredni-ceni";

const CITIES = [
  { name: "София", slug: "sofiya", key: "sofia" },
  { name: "Пловдив", slug: "plovdiv", key: "plovdiv" },
  { name: "Варна", slug: "varna", key: "varna" },
  { name: "Бургас", slug: "burgas", key: "burgas" },
  { name: "Русе", slug: "ruse", key: "ruse" },
  { name: "Стара Загора", slug: "stara-zagora", key: "stara-zagora" },
  { name: "Плевен", slug: "pleven", key: "pleven" },
  { name: "Благоевград", slug: "blagoevgrad", key: "blagoevgrad" },
  { name: "Велико Търново", slug: "veliko-tarnovo", key: "veliko-tarnovo" },
  { name: "Шумен", slug: "shumen", key: "shumen" },
  { name: "Добрич", slug: "dobrich", key: "dobrich" },
  { name: "Пазарджик", slug: "pazardzhik", key: "pazardzhik" },
  { name: "Хасково", slug: "haskovo", key: "haskovo" },
  { name: "Сливен", slug: "sliven", key: "sliven" },
  { name: "Перник", slug: "pernik", key: "pernik" },
  { name: "Ямбол", slug: "yambol", key: "yambol" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseNumber(text) {
  if (!text || text.trim() === "-") return null;
  const cleaned = text.replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num);
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "bg-BG,bg;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return iconv.decode(buffer, "windows-1251");
}

function parseNeighbourhoodTable(html) {
  const $ = cheerio.load(html);
  const neighbourhoods = [];

  $("table tr").each((i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 8) return;

    const nameCell = $(cells[0]);
    const name = nameCell.text().trim();
    if (!name || name === "Район") return;

    const link = nameCell.find("a").attr("href") || "";

    const oneRoom = {
      price: parseNumber($(cells[1]).text()),
      pricePerSqm: parseNumber($(cells[2]).text()),
    };

    const twoRoom = {
      price: parseNumber($(cells[3]).text()),
      pricePerSqm: parseNumber($(cells[4]).text()),
    };

    const threeRoom = {
      price: parseNumber($(cells[5]).text()),
      pricePerSqm: parseNumber($(cells[6]).text()),
    };

    const totalPricePerSqm = parseNumber($(cells[7]).text());

    if (!totalPricePerSqm && !oneRoom.pricePerSqm && !twoRoom.pricePerSqm && !threeRoom.pricePerSqm) {
      return;
    }

    neighbourhoods.push({
      name,
      link,
      oneRoom,
      twoRoom,
      threeRoom,
      totalPricePerSqm,
    });
  });

  return neighbourhoods;
}

function computeCityStats(neighbourhoods) {
  const withTotal = neighbourhoods.filter((n) => n.totalPricePerSqm);
  if (withTotal.length === 0) {
    return { avgPricePerSqm: 0, medianPricePerSqm: 0, minPricePerSqm: 0, maxPricePerSqm: 0, neighbourhoodCount: 0 };
  }

  const prices = withTotal.map((n) => n.totalPricePerSqm).sort((a, b) => a - b);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const median =
    prices.length % 2 === 0
      ? Math.round((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)
      : prices[Math.floor(prices.length / 2)];

  return {
    avgPricePerSqm: avg,
    medianPricePerSqm: median,
    minPricePerSqm: prices[0],
    maxPricePerSqm: prices.at(-1),
    neighbourhoodCount: withTotal.length,
  };
}

async function scrapeCity(city) {
  const url = `${BASE_URL}/prodazhbi-${city.slug}`;
  console.log(`  ${city.name}: ${url}`);

  const html = await fetchPage(url);
  const neighbourhoods = parseNeighbourhoodTable(html);
  const stats = computeCityStats(neighbourhoods);

  console.log(`    → ${neighbourhoods.length} квартала, средно ${stats.avgPricePerSqm} EUR/м²`);

  return {
    city: city.name,
    key: city.key,
    slug: city.slug,
    stats,
    neighbourhoods,
  };
}

function generateHistoryFile() {
  let files;
  try {
    files = readdirSync(DATA_DIR);
  } catch {
    return;
  }

  const history = files
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      try {
        const data = JSON.parse(readFileSync(join(DATA_DIR, file), "utf-8"));
        return {
          date: data.date,
          cities: data.cities.map((c) => ({
            city: c.city,
            key: c.key,
            avgPricePerSqm: c.stats.avgPricePerSqm,
            medianPricePerSqm: c.stats.medianPricePerSqm,
            neighbourhoodCount: c.stats.neighbourhoodCount,
          })),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  const historyPath = join(DATA_DIR, "..", "history.json");
  writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
  console.log(`\nИстория: ${historyPath} (${history.length} дни)`);
}

async function main() {
  console.log("=== Средни цени от imot.bg ===");
  console.log(`Дата: ${new Date().toISOString()}\n`);

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const results = [];

  for (const city of CITIES) {
    try {
      const cityData = await scrapeCity(city);
      results.push(cityData);
    } catch (error) {
      console.error(`  ✗ ${city.name}: ${error.message}`);
      results.push({
        city: city.name,
        key: city.key,
        slug: city.slug,
        stats: { avgPricePerSqm: 0, medianPricePerSqm: 0, minPricePerSqm: 0, maxPricePerSqm: 0, neighbourhoodCount: 0 },
        neighbourhoods: [],
        error: error.message,
      });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  const today = new Date().toISOString().split("T")[0];
  const output = {
    date: today,
    scrapedAt: new Date().toISOString(),
    source: "imot.bg/sredni-ceni",
    cities: results,
  };

  const dailyPath = join(DATA_DIR, `${today}.json`);
  writeFileSync(dailyPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\nЗаписано: ${dailyPath}`);

  const latestPath = join(DATA_DIR, "..", "latest.json");
  writeFileSync(latestPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`Записано: ${latestPath}`);

  generateHistoryFile();
  console.log("\n=== Готово! ===");
}

main().catch((error) => {
  console.error("Фатална грешка:", error);
  process.exit(1);
});
