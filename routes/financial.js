import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get financial data breakdown
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;

  // Get filter parameters from query string
  const includePaid = req.query.includePaid !== 'false'; // Default to true
  const includeUnpaid = req.query.includeUnpaid === 'true'; // Default to false

  // Build WHERE clause based on filters
  let whereClause = 'user_id = ?';
  const params = [userId];

  if (includePaid && !includeUnpaid) {
    whereClause += ' AND paid = 1';
  } else if (!includePaid && includeUnpaid) {
    whereClause += ' AND (paid = 0 OR paid IS NULL)';
  } else if (!includePaid && !includeUnpaid) {
    // If both are false, return empty data
    return res.json({
      monthly: [],
      calendarYear: [],
      financialYear: [],
      grandTotal: 0
    });
  }
  // If both are true, no additional filter needed

  // Get all appointments for the user with location, service type, and service name
  db.all(
    `SELECT date, price, COALESCE(paid, 0) as paid, location, type, service FROM appointments WHERE ${whereClause}`,
    params,
    (err, appointments) => {
      if (err) {
        console.error('Error fetching appointments:', err);
        return res.status(500).json({ error: err.message });
      }

      // Process appointments to calculate financial data
      const financialData = {
        monthly: {},
        calendarYear: {},
        financialYear: {},
        byLocation: {},
        byServiceType: {},
        byServiceName: {},
        grandTotal: 0
      };

      appointments.forEach(apt => {
        // No need to filter here - already filtered in SQL

        const date = new Date(apt.date);
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-11
        const monthName = date.toLocaleDateString('en-GB', { month: 'short' });
        
        // Calendar year (Jan-Dec) with monthly breakdown
        const calendarYearKey = year;
        if (!financialData.calendarYear[calendarYearKey]) {
          financialData.calendarYear[calendarYearKey] = {
            total: 0,
            months: {}
          };
        }
        financialData.calendarYear[calendarYearKey].total += apt.price;
        
        // Monthly breakdown within calendar year
        if (!financialData.calendarYear[calendarYearKey].months[monthName]) {
          financialData.calendarYear[calendarYearKey].months[monthName] = 0;
        }
        financialData.calendarYear[calendarYearKey].months[monthName] += apt.price;

        // Financial year (6 Apr - 5 Apr)
        // UK tax year runs from April 6 to April 5
        const day = date.getDate();
        let financialYearStart = year;
        if (month < 3 || (month === 3 && day < 6)) {
          // Jan, Feb, Mar, or Apr 1-5 belong to previous financial year
          financialYearStart = year - 1;
        }
        const financialYearKey = `${financialYearStart}-${financialYearStart + 1}`;
        if (!financialData.financialYear[financialYearKey]) {
          financialData.financialYear[financialYearKey] = {
            total: 0,
            months: {}
          };
        }
        financialData.financialYear[financialYearKey].total += apt.price;

        // Monthly breakdown within financial year
        const monthKey = monthName;
        if (!financialData.financialYear[financialYearKey].months[monthKey]) {
          financialData.financialYear[financialYearKey].months[monthKey] = 0;
        }
        financialData.financialYear[financialYearKey].months[monthKey] += apt.price;

        // Overall monthly (all years combined)
        const monthYearKey = `${monthName} ${year}`;
        if (!financialData.monthly[monthYearKey]) {
          financialData.monthly[monthYearKey] = {
            month: monthName,
            year: year,
            total: 0
          };
        }
        financialData.monthly[monthYearKey].total += apt.price;

        // Location breakdown with year/month
        const location = apt.location || 'Unknown';
        if (!financialData.byLocation[location]) {
          financialData.byLocation[location] = {
            total: 0,
            years: {}
          };
        }
        financialData.byLocation[location].total += apt.price;
        
        // Year breakdown for location
        if (!financialData.byLocation[location].years[year]) {
          financialData.byLocation[location].years[year] = {
            total: 0,
            months: {}
          };
        }
        financialData.byLocation[location].years[year].total += apt.price;
        
        // Month breakdown for location
        if (!financialData.byLocation[location].years[year].months[monthName]) {
          financialData.byLocation[location].years[year].months[monthName] = 0;
        }
        financialData.byLocation[location].years[year].months[monthName] += apt.price;

        // Service type breakdown with year/month
        const serviceType = apt.type || 'Unknown';
        if (!financialData.byServiceType[serviceType]) {
          financialData.byServiceType[serviceType] = {
            total: 0,
            years: {}
          };
        }
        financialData.byServiceType[serviceType].total += apt.price;
        
        // Year breakdown for service type
        if (!financialData.byServiceType[serviceType].years[year]) {
          financialData.byServiceType[serviceType].years[year] = {
            total: 0,
            months: {}
          };
        }
        financialData.byServiceType[serviceType].years[year].total += apt.price;
        
        // Month breakdown for service type
        if (!financialData.byServiceType[serviceType].years[year].months[monthName]) {
          financialData.byServiceType[serviceType].years[year].months[monthName] = 0;
        }
        financialData.byServiceType[serviceType].years[year].months[monthName] += apt.price;

        // Service name breakdown with year/month
        const serviceName = apt.service || 'Unknown';
        if (!financialData.byServiceName[serviceName]) {
          financialData.byServiceName[serviceName] = {
            total: 0,
            years: {}
          };
        }
        financialData.byServiceName[serviceName].total += apt.price;
        
        // Year breakdown for service name
        if (!financialData.byServiceName[serviceName].years[year]) {
          financialData.byServiceName[serviceName].years[year] = {
            total: 0,
            months: {}
          };
        }
        financialData.byServiceName[serviceName].years[year].total += apt.price;
        
        // Month breakdown for service name
        if (!financialData.byServiceName[serviceName].years[year].months[monthName]) {
          financialData.byServiceName[serviceName].years[year].months[monthName] = 0;
        }
        financialData.byServiceName[serviceName].years[year].months[monthName] += apt.price;

        financialData.grandTotal += apt.price;
      });

      // Sort financial years
      const sortedFinancialYears = Object.keys(financialData.financialYear).sort((a, b) => {
        const aStart = parseInt(a.split('-')[0]);
        const bStart = parseInt(b.split('-')[0]);
        return aStart - bStart;
      });

      // Sort months within each financial year
      const monthOrder = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
      sortedFinancialYears.forEach(fyKey => {
        const months = financialData.financialYear[fyKey].months;
        const sortedMonths = {};
        monthOrder.forEach(month => {
          if (months[month]) {
            sortedMonths[month] = months[month];
          }
        });
        financialData.financialYear[fyKey].months = sortedMonths;
      });

      // Sort monthly data
      const sortedMonthly = Object.values(financialData.monthly).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        const aMonth = monthOrder.indexOf(a.month);
        const bMonth = monthOrder.indexOf(b.month);
        return aMonth - bMonth;
      });

      // Sort calendar years and their months
      const sortedCalendarYears = Object.keys(financialData.calendarYear).sort((a, b) => {
        return parseInt(a) - parseInt(b);
      });
      
      const calendarYearOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      sortedCalendarYears.forEach(cyKey => {
        const months = financialData.calendarYear[cyKey].months;
        const sortedMonths = {};
        calendarYearOrder.forEach(month => {
          if (months[month]) {
            sortedMonths[month] = months[month];
          }
        });
        financialData.calendarYear[cyKey].months = sortedMonths;
      });

      // Sort location, service type, and service name by total (descending)
      const sortedByLocation = Object.entries(financialData.byLocation)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([location, data]) => {
          const sortedYears = Object.keys(data.years).sort((a, b) => parseInt(a) - parseInt(b)).map(yearKey => {
            const yearData = data.years[yearKey];
            const sortedMonths = {};
            calendarYearOrder.forEach(month => {
              if (yearData.months[month]) {
                sortedMonths[month] = yearData.months[month];
              }
            });
            return {
              year: yearKey,
              total: yearData.total,
              months: sortedMonths
            };
          });
          return { location, total: data.total, years: sortedYears };
        });

      const sortedByServiceType = Object.entries(financialData.byServiceType)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([type, data]) => {
          const sortedYears = Object.keys(data.years).sort((a, b) => parseInt(a) - parseInt(b)).map(yearKey => {
            const yearData = data.years[yearKey];
            const sortedMonths = {};
            calendarYearOrder.forEach(month => {
              if (yearData.months[month]) {
                sortedMonths[month] = yearData.months[month];
              }
            });
            return {
              year: yearKey,
              total: yearData.total,
              months: sortedMonths
            };
          });
          return { type, total: data.total, years: sortedYears };
        });

      const sortedByServiceName = Object.entries(financialData.byServiceName)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, data]) => {
          const sortedYears = Object.keys(data.years).sort((a, b) => parseInt(a) - parseInt(b)).map(yearKey => {
            const yearData = data.years[yearKey];
            const sortedMonths = {};
            calendarYearOrder.forEach(month => {
              if (yearData.months[month]) {
                sortedMonths[month] = yearData.months[month];
              }
            });
            return {
              year: yearKey,
              total: yearData.total,
              months: sortedMonths
            };
          });
          return { name, total: data.total, years: sortedYears };
        });

      res.json({
        monthly: sortedMonthly,
        calendarYear: sortedCalendarYears.map(cyKey => ({
          key: cyKey,
          total: financialData.calendarYear[cyKey].total,
          months: financialData.calendarYear[cyKey].months
        })),
        financialYear: sortedFinancialYears.map(fyKey => ({
          key: fyKey,
          total: financialData.financialYear[fyKey].total,
          months: financialData.financialYear[fyKey].months
        })),
        byLocation: sortedByLocation,
        byServiceType: sortedByServiceType,
        byServiceName: sortedByServiceName,
        grandTotal: financialData.grandTotal
      });
    }
  );
});

// UK Tax Year Report for self-assessment
router.get('/tax-report/:taxYear', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.userId;
  const startYear = parseInt(req.params.taxYear, 10);

  if (isNaN(startYear)) {
    return res.status(400).json({ error: 'Invalid tax year' });
  }

  const dateFrom = `${startYear}-04-06`;
  const dateTo = `${startYear + 1}-04-05`;

  // Fetch appointments, mileage, and expenses in parallel
  const results = {};

  // 1. Income from appointments
  db.all(
    `SELECT date, client_name, service, type, price, location, paid
     FROM appointments
     WHERE user_id = ? AND date >= ? AND date <= ?
     ORDER BY date ASC`,
    [userId, dateFrom, dateTo],
    (err, appointments) => {
      if (err) return res.status(500).json({ error: err.message });

      // Calculate income totals
      const totalIncome = appointments.reduce((sum, a) => sum + (a.price || 0), 0);
      const paidIncome = appointments.filter(a => a.paid).reduce((sum, a) => sum + (a.price || 0), 0);
      const unpaidIncome = totalIncome - paidIncome;

      // Monthly breakdown (Apr-Mar order)
      const monthlyIncome = {};
      appointments.forEach(a => {
        const d = new Date(a.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        if (!monthlyIncome[key]) monthlyIncome[key] = { key, label, total: 0, count: 0 };
        monthlyIncome[key].total += a.price || 0;
        monthlyIncome[key].count++;
      });

      // Sort months in tax year order (Apr first)
      const sortedMonths = Object.values(monthlyIncome).sort((a, b) => a.key.localeCompare(b.key));

      results.income = {
        total: totalIncome,
        paid: paidIncome,
        unpaid: unpaidIncome,
        appointmentCount: appointments.length,
        monthly: sortedMonths
      };

      // 2. Mileage - unique trips (one per location per day)
      db.all(
        `SELECT a.date, a.location, ad.distance
         FROM appointments a
         LEFT JOIN address_data ad ON a.location = ad.location_name AND a.user_id = ad.user_id
         WHERE a.user_id = ? AND a.date >= ? AND a.date <= ? AND ad.distance IS NOT NULL AND ad.distance > 0
         GROUP BY a.date, a.location
         ORDER BY a.date ASC`,
        [userId, dateFrom, dateTo],
        (err2, trips) => {
          if (err2) return res.status(500).json({ error: err2.message });

          // Calculate mileage
          let totalMiles = 0;
          const tripLog = trips.map(t => {
            const roundTrip = (t.distance || 0) * 2;
            totalMiles += roundTrip;
            return {
              date: t.date,
              location: t.location,
              distanceOneWay: t.distance,
              roundTrip
            };
          });

          // HMRC mileage rates: 45p first 10,000 miles, 25p thereafter
          const milesAt45p = Math.min(totalMiles, 10000);
          const milesAt25p = Math.max(0, totalMiles - 10000);
          const mileageAllowance = (milesAt45p * 0.45) + (milesAt25p * 0.25);

          // Mileage by location summary
          const byLocation = {};
          tripLog.forEach(t => {
            if (!byLocation[t.location]) {
              byLocation[t.location] = { location: t.location, trips: 0, totalMiles: 0, distanceOneWay: t.distanceOneWay };
            }
            byLocation[t.location].trips++;
            byLocation[t.location].totalMiles += t.roundTrip;
          });

          results.mileage = {
            totalMiles,
            milesAt45p,
            milesAt25p,
            mileageAllowance,
            tripCount: trips.length,
            tripLog,
            byLocation: Object.values(byLocation).sort((a, b) => b.totalMiles - a.totalMiles)
          };

          // 3. Expenses
          db.all(
            `SELECT e.*, ec.name as category_name, ec.hmrc_category
             FROM expenses e
             LEFT JOIN expense_categories ec ON e.category_id = ec.id
             WHERE e.user_id = ? AND e.date >= ? AND e.date <= ?
             ORDER BY e.date ASC`,
            [userId, dateFrom, dateTo],
            (err3, expenses) => {
              if (err3) return res.status(500).json({ error: err3.message });

              const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

              // Group by category
              const byCategory = {};
              expenses.forEach(e => {
                const cat = e.category_name || 'Uncategorised';
                if (!byCategory[cat]) byCategory[cat] = { category: cat, hmrc_category: e.hmrc_category, total: 0, count: 0 };
                byCategory[cat].total += e.amount || 0;
                byCategory[cat].count++;
              });

              results.expenses = {
                total: totalExpenses,
                count: expenses.length,
                byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
                items: expenses
              };

              // 4. SA103 Summary
              const totalAllowableExpenses = totalExpenses + mileageAllowance;
              const netProfit = totalIncome - totalAllowableExpenses;

              results.sa103 = {
                taxYear: `${startYear}/${startYear + 1}`,
                dateFrom,
                dateTo,
                box9_turnover: totalIncome,
                box10_otherIncome: 0,
                box17_travelCosts: mileageAllowance,
                box20_otherExpenses: totalExpenses,
                box27_totalAllowableExpenses: totalAllowableExpenses,
                box29_netProfit: netProfit
              };

              res.json(results);
            }
          );
        }
      );
    }
  );
});

export default router;

