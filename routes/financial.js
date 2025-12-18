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

        // Financial year (Apr-Mar)
        // UK financial year runs from April 1 to March 31
        let financialYearStart = year;
        if (month < 3) { // Jan, Feb, Mar belong to previous financial year
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

export default router;

