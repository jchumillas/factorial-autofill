// server.js
import express from 'express';
import axios from 'axios';
import moment from 'moment';
import cors from 'cors';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- Constants and Holidays ---
const year = new Date().getFullYear();
const apiUrl = 'https://api.factorialhr.com';

const holidaysStatic = [
  `${year}-01-01`, `${year}-01-06`, `${year}-03-20`, `${year}-04-17`, `${year}-04-18`,
  `${year}-05-01`, `${year}-05-02`, `${year}-05-15`, `${year}-08-15`, `${year}-10-12`,
  `${year}-11-01`, `${year}-11-09`, `${year}-12-06`, `${year}-12-08`, `${year}-12-25`,
];

async function getEmployeeId(cookie) {
  const url = `${apiUrl}/graphql?GetCurrent=`;
  try {
    const response = await axios.post(url,
      {
        query: `query GetCurrent {
          apiCore {
            currentsConnection {
              edges {
                node {
                  employee {
                    id
                  }
                }
              }
            }
          }
        }`,
      },
      {
        headers: { Cookie: cookie },
      }
    );
    const employeeId = response.data.data.apiCore.currentsConnection.edges[0].node.employee.id;
    return employeeId;
  } catch (error) {
    console.error('Error getting Employee ID:', error.message);
    throw error;
  }
}

// --- Factorial API Functions ---
async function getPeriodId(month, lastMonthDay, cookie, employeeId) {
  const url = `${apiUrl}/attendance/periods?year=${year}&employee_id=${employeeId}&month=${month}&start_on=${year}-${month}-01&end_on=${year}-${month}-${lastMonthDay}`;
  try {
    const resp = await axios.get(url, { headers: { Cookie: cookie } });
    if (resp.data && resp.data.length > 0) {
      return resp.data[0].id;
    }
    throw new Error('Period ID not found.');
  } catch (error) {
    console.error(`Error getting Period ID for month ${month}:`, error.message);
  }
}

async function postHour(date, day, periodId, clockIn, clockOut, cookie) {
  const url = `${apiUrl}/attendance/shifts`;
  const payload = {
    period_id: periodId,
    date,
    day,
    clock_in: clockIn,
    clock_out: clockOut,
  };

  try {
    await axios.post(url, payload, { headers: { Cookie: cookie } });
    console.log(`✅ Time entry inserted for ${date}: ${clockIn} - ${clockOut}`);
  } catch (error) {
    console.error(`❌ Error inserting time entry for ${date}:`, error.response?.data?.message || error.message);
  }
}

// --- API Endpoints ---
app.post('/fill-hours', async (req, res) => {
  const { cookie, dateFrom, dateTo, hoursMonThurs, hoursFri, holidays } = req.body;
  
  if (!cookie || !dateFrom || !dateTo || !hoursMonThurs || !hoursFri || !holidays) {
    return res.status(400).json({ message: 'Missing data in request.' });
  }

  try {
    const employeeId = await getEmployeeId(cookie);
    console.log('🚀 Starting time entry process...');
    
    const start = moment(dateFrom);
    const end = moment(dateTo);

    for (let date = start.clone(); date.isSameOrBefore(end); date.add(1, 'days')) {
      const formattedDate = date.format('YYYY-MM-DD');
      const dayOfWeek = date.isoWeekday();

      if (dayOfWeek > 5 || holidays.includes(formattedDate)) {
        console.log(`⏭️  Skipping day: ${formattedDate} (weekend or holiday)`);
        continue;
      }

      const month = date.format('M');
      const lastMonthDay = date.clone().endOf('month').format('DD');
      const periodId = await getPeriodId(month, lastMonthDay, cookie, employeeId);
      
      console.log(`\n▶️  Processing day: ${formattedDate}`);

      const schedule = (dayOfWeek <= 4) ? hoursMonThurs : hoursFri;
      for (const slot of schedule) {
        if (slot.clock_in && slot.clock_out) {
          await postHour(formattedDate, date.format('D'), periodId, slot.clock_in, slot.clock_out, cookie);
        }
      }
    }

    console.log('🎉 Process completed.');
    res.status(200).json({ message: 'Time entry process completed successfully!' });

  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    res.status(500).json({ message: `Fatal error: ${error.message}` });
  }
});

app.get('/holidays', (req, res) => {
  res.status(200).json(holidaysStatic);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});