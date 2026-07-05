import fs from "fs";
import path from "path";

export interface StockRecord {
  Datetime: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

export interface TickerStats {
  ticker: string;
  total_rows: number;
  start_date: string;
  end_date: string;
  close: {
    mean: number;
    min: number;
    max: number;
    std: number;
  };
  volume: {
    mean: number;
    min: number;
    max: number;
    std: number;
  };
}

const TICKERS = ["AAPL", "AMZN", "BRK-B", "GOOGL", "META", "MSFT", "NVDA", "TSLA"];

export class DataService {
  private static cache: Record<string, StockRecord[]> = {};

  private static getDatasetPath(ticker: string): string {
    // Relative to frontend folder, NASDAQ_2022 is in parent directory
    const projectRoot = path.resolve(process.cwd(), "..");
    return path.join(projectRoot, "NASDAQ_2022", ticker, `${ticker}_2022_full_15min.csv`);
  }

  public static getTickers(): string[] {
    return TICKERS;
  }

  public static getRecords(ticker: string): StockRecord[] {
    if (!TICKERS.includes(ticker)) {
      throw new Error(`Ticker ${ticker} is not supported.`);
    }

    if (!this.cache[ticker]) {
      const filePath = this.getDatasetPath(ticker);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Data file not found for ${ticker} at ${filePath}`);
      }

      const fileContent = fs.readFileSync(filePath, "utf-8");
      const lines = fileContent.split(/\r?\n/);
      
      if (lines.length === 0) {
        return [];
      }

      const header = lines[0].split(",");
      const datetimeIdx = header.indexOf("Datetime");
      const openIdx = header.indexOf("Open");
      const highIdx = header.indexOf("High");
      const lowIdx = header.indexOf("Low");
      const closeIdx = header.indexOf("Close");
      const volumeIdx = header.indexOf("Volume");

      const records: StockRecord[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(",");
        if (cols.length < header.length) continue;

        records.push({
          Datetime: cols[datetimeIdx],
          Open: parseFloat(cols[openIdx]),
          High: parseFloat(cols[highIdx]),
          Low: parseFloat(cols[lowIdx]),
          Close: parseFloat(cols[closeIdx]),
          Volume: parseInt(cols[volumeIdx], 10)
        });
      }

      // Sort by Datetime ascending
      records.sort((a, b) => a.Datetime.localeCompare(b.Datetime));
      this.cache[ticker] = records;
    }

    return this.cache[ticker];
  }

  public static getStats(ticker: string): TickerStats {
    const records = this.getRecords(ticker);
    if (records.length === 0) {
      throw new Error(`No data found for ${ticker}`);
    }

    let minClose = Infinity;
    let maxClose = -Infinity;
    let sumClose = 0;
    
    let minVolume = Infinity;
    let maxVolume = -Infinity;
    let sumVolume = 0;

    for (const r of records) {
      if (r.Close < minClose) minClose = r.Close;
      if (r.Close > maxClose) maxClose = r.Close;
      sumClose += r.Close;

      if (r.Volume < minVolume) minVolume = r.Volume;
      if (r.Volume > maxVolume) maxVolume = r.Volume;
      sumVolume += r.Volume;
    }

    const meanClose = sumClose / records.length;
    const meanVolume = sumVolume / records.length;

    // Standard deviation Close
    let sqDiffClose = 0;
    let sqDiffVol = 0;
    for (const r of records) {
      sqDiffClose += Math.pow(r.Close - meanClose, 2);
      sqDiffVol += Math.pow(r.Volume - meanVolume, 2);
    }
    const stdClose = Math.sqrt(sqDiffClose / records.length);
    const stdVol = Math.sqrt(sqDiffVol / records.length);

    return {
      ticker,
      total_rows: records.length,
      start_date: records[0].Datetime,
      end_date: records[records.length - 1].Datetime,
      close: {
        mean: Math.round(meanClose * 100) / 100,
        min: Math.round(minClose * 100) / 100,
        max: Math.round(maxClose * 100) / 100,
        std: Math.round(stdClose * 100) / 100
      },
      volume: {
        mean: Math.round(meanVolume * 100) / 100,
        min: minVolume,
        max: maxVolume,
        std: Math.round(stdVol * 100) / 100
      }
    };
  }

  public static getPaginatedData(
    ticker: string,
    page: number = 1,
    pageSize: number = 20,
    month?: string
  ) {
    let records = this.getRecords(ticker);

    if (month) {
      // Month format expected is e.g. "01", "12"
      records = records.filter((r) => {
        // Extract month from "2022-01-03 04:00:00"
        const parts = r.Datetime.split(" ");
        if (parts[0]) {
          const dateParts = parts[0].split("-");
          return dateParts[1] === month;
        }
        return false;
      });
    }

    const total = records.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    
    // Clamp page
    const activePage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (activePage - 1) * pageSize;
    const endIdx = startIdx + pageSize;

    const data = records.slice(startIdx, endIdx);

    return {
      ticker,
      total,
      page: activePage,
      page_size: pageSize,
      pages: totalPages,
      data
    };
  }

  public static getChartData(ticker: string, month?: string): StockRecord[] {
    const records = this.getRecords(ticker);

    if (month) {
      // Return detailed 15-min data for the specific month
      return records.filter((r) => {
        const parts = r.Datetime.split(" ");
        if (parts[0]) {
          const dateParts = parts[0].split("-");
          return dateParts[1] === month;
        }
        return false;
      });
    }

    // Downsample the whole year data to Daily averages
    // Group records by day
    const dailyMap: Record<string, StockRecord[]> = {};
    for (const r of records) {
      const day = r.Datetime.split(" ")[0]; // "2022-01-03"
      if (!dailyMap[day]) {
        dailyMap[day] = [];
      }
      dailyMap[day].push(r);
    }

    const dailyData: StockRecord[] = [];
    const sortedDays = Object.keys(dailyMap).sort();

    for (const day of sortedDays) {
      const dayRecords = dailyMap[day];
      if (dayRecords.length === 0) continue;

      const open = dayRecords[0].Open;
      const close = dayRecords[dayRecords.length - 1].Close;
      let high = -Infinity;
      let low = Infinity;
      let sumVol = 0;

      for (const r of dayRecords) {
        if (r.High > high) high = r.High;
        if (r.Low < low) low = r.Low;
        sumVol += r.Volume;
      }

      dailyData.push({
        Datetime: day,
        Open: open,
        High: high,
        Low: low,
        Close: close,
        Volume: sumVol
      });
    }

    return dailyData;
  }
}
