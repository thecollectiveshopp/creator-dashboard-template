import { useEffect, useState } from 'react';
import { Assignment } from '@/types/assignment';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSNrwgH-lfZI9yQ1P4G-ciegSjqW6g2EMemyQaZQY294LyCH-Ul-q93v6kV_fXcn3K7S9hfzVUqsql2/pub?output=csv';

// Parse CSV text into rows, correctly handling multi-line quoted fields
function parseCSVRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  const fields: string[] = [];

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];

    if (char === '"') {
      if (inQuotes && i + 1 < csvText.length && csvText[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // End of row
      if (char === '\r' && i + 1 < csvText.length && csvText[i + 1] === '\n') {
        i++; // skip \r\n pair
      }
      fields.push(current.trim());
      if (fields.some(f => f.length > 0)) {
        rows.push([...fields]);
      }
      fields.length = 0;
      current = '';
    } else {
      current += char;
    }
  }
  // Last row
  fields.push(current.trim());
  if (fields.some(f => f.length > 0)) {
    rows.push([...fields]);
  }

  return rows;
}

function parseCSV(csvText: string): Assignment[] {
  const rows = parseCSVRows(csvText);

  console.log('Total CSV rows:', rows.length);
  console.log('Row 1 preview:', rows[0]?.slice(0, 5));

  if (rows.length < 4) {
    console.error('CSV has insufficient rows (need at least 4)');
    return [];
  }

  // FIND THE REAL HEADER ROW - look for row containing 'date_pst'
  const headerRowIndex = rows.findIndex(row =>
    row.some(cell => cell.toLowerCase().includes('date_pst'))
  );

  if (headerRowIndex === -1) {
    console.error('CRITICAL: Could not find header row containing "date_pst"');
    return [];
  }

  const headers = rows[headerRowIndex].map(h => h.toLowerCase().replace(/['"]+/g, '').trim());

  console.log('✅ Parsed headers:', headers);
  console.log('✅ Has notes column:', headers.includes('notes'));

  // Verify we have required headers
  if (!headers.includes('date_pst') || !headers.includes('creator_id')) {
    console.error('❌ Missing required headers! Found:', headers);
    return [];
  }

  // Map data rows (everything AFTER the header row)
  const results: Assignment[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const values = rows[i];

    // Skip empty rows
    if (values.every(v => v.length === 0)) continue;

    const row: Assignment = {};
    headers.forEach((header, index) => {
      let value = values[index] || '';
      value = value.replace(/^"|"$/g, '').replace(/[\r\n\t]+/g, '').trim();
      row[header] = value;
    });

    if (row['date_pst'] && row['creator_id']) {
      results.push(row);
    }
  }

  console.log('✅ First parsed data row:', results[0]);
  console.log('✅ Total valid data rows:', results.length);

  return results;
}

export function useAssignments(creatorId: string | null) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [yesterdayAssignments, setYesterdayAssignments] = useState<Assignment[]>([]);
  const [twoDaysAgoAssignments, setTwoDaysAgoAssignments] = useState<Assignment[]>([]);
  const [tomorrowAssignments, setTomorrowAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = () => setRefreshKey(prev => prev + 1);

  useEffect(() => {
    async function fetchAssignments() {
      setLoading(true);
      setError(null);

      try {
        const cacheBuster = `&_t=${Date.now()}`;
        const response = await fetch(CSV_URL + cacheBuster, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
        }

        const csvText = await response.text();
        const allRows = parseCSV(csvText);

        const getDatePST = (daysOffset: number): string => {
          const d = new Date();
          d.setDate(d.getDate() + daysOffset);
          return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
        };

        const todayPST = getDatePST(0);
        const yesterdayPST = getDatePST(-1);
        const twoDaysAgoPST = getDatePST(-2);
        const tomorrowPST = getDatePST(1);

        const normalizedCreatorId = (creatorId || '').trim().toLowerCase();

        const filterByDate = (rows: Assignment[], targetDate: string) => {
          return rows.filter(row => {
            const rowDate = String(row['date_pst'] || '').trim().replace(/[\r\n\t]+/g, '');
            const rowCreatorId = String(row['creator_id'] || '').trim().toLowerCase().replace(/[\r\n\t]+/g, '');
            const dateMatch = rowDate === targetDate;
            const creatorMatch = normalizedCreatorId === '' || rowCreatorId === normalizedCreatorId;
            return dateMatch && creatorMatch;
          });
        };

        setAssignments(filterByDate(allRows, todayPST));
        setYesterdayAssignments(filterByDate(allRows, yesterdayPST));
        setTwoDaysAgoAssignments(filterByDate(allRows, twoDaysAgoPST));
        setTomorrowAssignments(filterByDate(allRows, tomorrowPST));
      } catch (err: any) {
        console.error('Error loading assignments:', err);
        setError(err.message || 'Failed to load assignments');
      } finally {
        setLoading(false);
      }
    }

    fetchAssignments();
  }, [creatorId, refreshKey]);

  return { assignments, yesterdayAssignments, twoDaysAgoAssignments, tomorrowAssignments, loading, error, refetch };
}
