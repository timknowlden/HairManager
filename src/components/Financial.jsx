import { useState, useEffect } from 'react';
import { FaChartLine } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import './Financial.css';

import { API_BASE } from '../config.js';

function Financial() {
  const { getAuthHeaders } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [financialData, setFinancialData] = useState(null);
  const [expandedFinancialYears, setExpandedFinancialYears] = useState(new Set());
  const [expandedCalendarYears, setExpandedCalendarYears] = useState(new Set());
  const [expandedLocations, setExpandedLocations] = useState(new Set());
  const [expandedLocationYears, setExpandedLocationYears] = useState(new Set());
  const [expandedServiceTypes, setExpandedServiceTypes] = useState(new Set());
  const [expandedServiceTypeYears, setExpandedServiceTypeYears] = useState(new Set());
  const [expandedServiceNames, setExpandedServiceNames] = useState(new Set());
  const [expandedServiceNameYears, setExpandedServiceNameYears] = useState(new Set());
  const [includePaid, setIncludePaid] = useState(true);
  const [includeUnpaid, setIncludeUnpaid] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    fetchFinancialData();
  }, [includePaid, includeUnpaid]);

  const fetchFinancialData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        includePaid: includePaid.toString(),
        includeUnpaid: includeUnpaid.toString()
      });
      const response = await fetch(`${API_BASE}/financial?${params}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch financial data');
      }

      const data = await response.json();
      setFinancialData(data);
      
      // Only expand on initial load, preserve state on filter changes
      if (isInitialLoad) {
        if (data.financialYear && data.financialYear.length > 0) {
          const mostRecent = data.financialYear[data.financialYear.length - 1].key;
          setExpandedFinancialYears(new Set([mostRecent]));
        }
        if (data.calendarYear && data.calendarYear.length > 0) {
          const mostRecent = data.calendarYear[data.calendarYear.length - 1].key;
          setExpandedCalendarYears(new Set([mostRecent]));
        }
        setIsInitialLoad(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to load financial data');
    } finally {
      setLoading(false);
    }
  };

  const toggleFinancialYear = (fyKey) => {
    setExpandedFinancialYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fyKey)) {
        newSet.delete(fyKey);
      } else {
        newSet.add(fyKey);
      }
      return newSet;
    });
  };

  const toggleCalendarYear = (cyKey) => {
    setExpandedCalendarYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cyKey)) {
        newSet.delete(cyKey);
      } else {
        newSet.add(cyKey);
      }
      return newSet;
    });
  };

  const toggleLocation = (location) => {
    setExpandedLocations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(location)) {
        newSet.delete(location);
      } else {
        newSet.add(location);
      }
      return newSet;
    });
  };

  const toggleLocationYear = (location, year) => {
    const key = `${location}-${year}`;
    setExpandedLocationYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const toggleServiceType = (type) => {
    setExpandedServiceTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  const toggleServiceTypeYear = (type, year) => {
    const key = `${type}-${year}`;
    setExpandedServiceTypeYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const toggleServiceName = (name) => {
    setExpandedServiceNames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(name)) {
        newSet.delete(name);
      } else {
        newSet.add(name);
      }
      return newSet;
    });
  };

  const toggleServiceNameYear = (name, year) => {
    const key = `${name}-${year}`;
    setExpandedServiceNameYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="financial-container">
        <div className="financial-header">
          <h2>Financial Summary</h2>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="financial-container">
        <div className="financial-header">
          <h2>Financial Summary</h2>
        </div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (!financialData) {
    return (
      <div className="financial-container">
        <div className="financial-header">
          <h2>Financial Summary</h2>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>No financial data available</div>
      </div>
    );
  }

  const monthOrder = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

  return (
    <div className="financial-container">
      <div className="financial-header">
        <h2>Financial Summary</h2>
        <p className="financial-subtitle">Earnings breakdown by financial year, calendar year, and month</p>
      </div>

      <div className="financial-filters">
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={includePaid}
            onChange={(e) => setIncludePaid(e.target.checked)}
          />
          <span>Paid</span>
        </label>
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={includeUnpaid}
            onChange={(e) => setIncludeUnpaid(e.target.checked)}
          />
          <span>Unpaid</span>
        </label>
      </div>

      {/* Financial Year Summary */}
      {financialData.financialYear && financialData.financialYear.length > 0 && (
        <div className="financial-year-section">
          <h3>Financial Year</h3>
          <div className="financial-table-wrapper">
            <table className="financial-table financial-year-table">
              <thead>
                <tr>
                  <th>Financial Year / Date - Month</th>
                  <th>SUM of Price</th>
                </tr>
              </thead>
            <tbody>
              {/* Financial Year Breakdowns */}
              {financialData.financialYear.map((fy) => {
              const isExpanded = expandedFinancialYears.has(fy.key);
              const monthEntries = Object.entries(fy.months).sort((a, b) => {
                const aIndex = monthOrder.indexOf(a[0]);
                const bIndex = monthOrder.indexOf(b[0]);
                return aIndex - bIndex;
              });
              const monthTotal = monthEntries.reduce((sum, [, amount]) => sum + amount, 0);

              return (
                <>
                  {/* Financial Year Header Row */}
                  <tr key={`${fy.key}-header`} className="financial-year-row">
                    <td>
                      <button
                        type="button"
                        className="expand-button"
                        onClick={() => toggleFinancialYear(fy.key)}
                        style={{ marginRight: '10px' }}
                      >
                        {isExpanded ? '−' : '+'}
                      </button>
                      {fy.key} Total
                    </td>
                    <td className="amount-cell">{formatCurrency(fy.total)}</td>
                  </tr>
                  
                  {/* Monthly Breakdown (if expanded) */}
                  {isExpanded && monthEntries.map(([month, amount]) => (
                    <tr key={`${fy.key}-${month}`} className="month-row">
                      <td>{month}</td>
                      <td className="amount-cell">{formatCurrency(amount)}</td>
                    </tr>
                  ))}
                  
                  {/* Month Total (if expanded) */}
                  {isExpanded && monthEntries.length > 0 && (
                    <tr key={`${fy.key}-total`} className="month-total-row">
                      <td>Total</td>
                      <td className="amount-cell">{formatCurrency(monthTotal)}</td>
                    </tr>
                  )}
                </>
              );
            })}

            {/* Grand Total Row */}
            <tr className="grand-total-row">
              <td>Grand Total</td>
              <td className="amount-cell">
                {formatCurrency(financialData.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
      )}

      {/* Calendar Year Summary */}
      {financialData.calendarYear && financialData.calendarYear.length > 0 && (
        <div className="calendar-year-section">
          <h3>Calendar Year</h3>
          <div className="financial-table-wrapper">
            <table className="financial-table">
              <thead>
                <tr>
                  <th>Calendar Year / Date - Month</th>
                  <th>SUM of Price</th>
                </tr>
              </thead>
              <tbody>
                {financialData.calendarYear.map((cy) => {
                  const isExpanded = expandedCalendarYears.has(cy.key);
                  const monthEntries = Object.entries(cy.months).sort((a, b) => {
                    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const aIndex = monthOrder.indexOf(a[0]);
                    const bIndex = monthOrder.indexOf(b[0]);
                    return aIndex - bIndex;
                  });
                  const monthTotal = monthEntries.reduce((sum, [, amount]) => sum + amount, 0);

                  return (
                    <>
                      {/* Calendar Year Header Row */}
                      <tr key={`${cy.key}-header`} className="financial-year-row">
                        <td>
                          <button
                            type="button"
                            className="expand-button"
                            onClick={() => toggleCalendarYear(cy.key)}
                            style={{ marginRight: '10px' }}
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                          {cy.key} Total
                        </td>
                        <td className="amount-cell">{formatCurrency(cy.total)}</td>
                      </tr>
                      
                      {/* Monthly Breakdown (if expanded) */}
                      {isExpanded && monthEntries.map(([month, amount]) => (
                        <tr key={`${cy.key}-${month}`} className="month-row">
                          <td>{month}</td>
                          <td className="amount-cell">{formatCurrency(amount)}</td>
                        </tr>
                      ))}
                      
                      {/* Month Total (if expanded) */}
                      {isExpanded && monthEntries.length > 0 && (
                        <tr key={`${cy.key}-total`} className="month-total-row">
                          <td>Total</td>
                          <td className="amount-cell">{formatCurrency(monthTotal)}</td>
                        </tr>
                      )}
                    </>
                  );
                })}
                
                {/* Grand Total Row for Calendar Year */}
                <tr className="grand-total-row calendar-year-grand-total">
                  <td>Grand Total</td>
                  <td className="amount-cell">
                    {formatCurrency(financialData.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Location Breakdown */}
      {financialData.byLocation && financialData.byLocation.length > 0 && (
        <div className="location-section">
          <h3>By Location</h3>
          <div className="financial-table-wrapper">
            <table className="financial-table location-table">
              <thead>
                <tr>
                  <th>Location / Year / Month</th>
                  <th>SUM of Price</th>
                </tr>
              </thead>
              <tbody>
                {financialData.byLocation.map((item) => {
                  const isExpanded = expandedLocations.has(item.location);
                  return (
                    <>
                      <tr key={item.location} className="financial-year-row">
                        <td>
                          <button
                            type="button"
                            className="expand-button"
                            onClick={() => toggleLocation(item.location)}
                            style={{ marginRight: '10px' }}
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                          {item.location}
                        </td>
                        <td className="amount-cell">{formatCurrency(item.total)}</td>
                      </tr>
                      {isExpanded && item.years && item.years.map((yearData) => {
                        const yearKey = `${item.location}-${yearData.year}`;
                        const isYearExpanded = expandedLocationYears.has(yearKey);
                        const monthEntries = Object.entries(yearData.months);
                        const monthTotal = monthEntries.reduce((sum, [, amount]) => sum + amount, 0);
                        return (
                          <>
                            <tr key={yearKey} className="month-row">
                              <td style={{ paddingLeft: '40px' }}>
                                <button
                                  type="button"
                                  className="expand-button"
                                  onClick={() => toggleLocationYear(item.location, yearData.year)}
                                  style={{ marginRight: '10px' }}
                                >
                                  {isYearExpanded ? '−' : '+'}
                                </button>
                                {yearData.year}
                              </td>
                              <td className="amount-cell">{formatCurrency(yearData.total)}</td>
                            </tr>
                            {isYearExpanded && monthEntries.map(([month, amount]) => (
                              <tr key={`${yearKey}-${month}`} className="month-row">
                                <td style={{ paddingLeft: '80px' }}>{month}</td>
                                <td className="amount-cell">{formatCurrency(amount)}</td>
                              </tr>
                            ))}
                            {isYearExpanded && monthEntries.length > 0 && (
                              <tr key={`${yearKey}-total`} className="month-total-row">
                                <td style={{ paddingLeft: '80px' }}>Total</td>
                                <td className="amount-cell">{formatCurrency(monthTotal)}</td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </>
                  );
                })}
                <tr className="grand-total-row location-grand-total">
                  <td>Grand Total</td>
                  <td className="amount-cell">
                    {formatCurrency(financialData.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Service Type Breakdown */}
      {financialData.byServiceType && financialData.byServiceType.length > 0 && (
        <div className="service-type-section">
          <h3>By Service Type</h3>
          <div className="financial-table-wrapper">
            <table className="financial-table service-type-table">
              <thead>
                <tr>
                  <th>Service Type / Year / Month</th>
                  <th>SUM of Price</th>
                </tr>
              </thead>
              <tbody>
                {financialData.byServiceType.map((item) => {
                  const isExpanded = expandedServiceTypes.has(item.type);
                  return (
                    <>
                      <tr key={item.type} className="financial-year-row">
                        <td>
                          <button
                            type="button"
                            className="expand-button"
                            onClick={() => toggleServiceType(item.type)}
                            style={{ marginRight: '10px' }}
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                          {item.type}
                        </td>
                        <td className="amount-cell">{formatCurrency(item.total)}</td>
                      </tr>
                      {isExpanded && item.years && item.years.map((yearData) => {
                        const yearKey = `${item.type}-${yearData.year}`;
                        const isYearExpanded = expandedServiceTypeYears.has(yearKey);
                        const monthEntries = Object.entries(yearData.months);
                        const monthTotal = monthEntries.reduce((sum, [, amount]) => sum + amount, 0);
                        return (
                          <>
                            <tr key={yearKey} className="month-row">
                              <td style={{ paddingLeft: '40px' }}>
                                <button
                                  type="button"
                                  className="expand-button"
                                  onClick={() => toggleServiceTypeYear(item.type, yearData.year)}
                                  style={{ marginRight: '10px' }}
                                >
                                  {isYearExpanded ? '−' : '+'}
                                </button>
                                {yearData.year}
                              </td>
                              <td className="amount-cell">{formatCurrency(yearData.total)}</td>
                            </tr>
                            {isYearExpanded && monthEntries.map(([month, amount]) => (
                              <tr key={`${yearKey}-${month}`} className="month-row">
                                <td style={{ paddingLeft: '80px' }}>{month}</td>
                                <td className="amount-cell">{formatCurrency(amount)}</td>
                              </tr>
                            ))}
                            {isYearExpanded && monthEntries.length > 0 && (
                              <tr key={`${yearKey}-total`} className="month-total-row">
                                <td style={{ paddingLeft: '80px' }}>Total</td>
                                <td className="amount-cell">{formatCurrency(monthTotal)}</td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </>
                  );
                })}
                <tr className="grand-total-row service-type-grand-total">
                  <td>Grand Total</td>
                  <td className="amount-cell">
                    {formatCurrency(financialData.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Service Name Breakdown */}
      {financialData.byServiceName && financialData.byServiceName.length > 0 && (
        <div className="service-name-section">
          <h3>By Service Name</h3>
          <div className="financial-table-wrapper">
            <table className="financial-table service-name-table">
              <thead>
                <tr>
                  <th>Service Name / Year / Month</th>
                  <th>SUM of Price</th>
                </tr>
              </thead>
              <tbody>
                {financialData.byServiceName.map((item) => {
                  const isExpanded = expandedServiceNames.has(item.name);
                  return (
                    <>
                      <tr key={item.name} className="financial-year-row">
                        <td>
                          <button
                            type="button"
                            className="expand-button"
                            onClick={() => toggleServiceName(item.name)}
                            style={{ marginRight: '10px' }}
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                          {item.name}
                        </td>
                        <td className="amount-cell">{formatCurrency(item.total)}</td>
                      </tr>
                      {isExpanded && item.years && item.years.map((yearData) => {
                        const yearKey = `${item.name}-${yearData.year}`;
                        const isYearExpanded = expandedServiceNameYears.has(yearKey);
                        const monthEntries = Object.entries(yearData.months);
                        const monthTotal = monthEntries.reduce((sum, [, amount]) => sum + amount, 0);
                        return (
                          <>
                            <tr key={yearKey} className="month-row">
                              <td style={{ paddingLeft: '40px' }}>
                                <button
                                  type="button"
                                  className="expand-button"
                                  onClick={() => toggleServiceNameYear(item.name, yearData.year)}
                                  style={{ marginRight: '10px' }}
                                >
                                  {isYearExpanded ? '−' : '+'}
                                </button>
                                {yearData.year}
                              </td>
                              <td className="amount-cell">{formatCurrency(yearData.total)}</td>
                            </tr>
                            {isYearExpanded && monthEntries.map(([month, amount]) => (
                              <tr key={`${yearKey}-${month}`} className="month-row">
                                <td style={{ paddingLeft: '80px' }}>{month}</td>
                                <td className="amount-cell">{formatCurrency(amount)}</td>
                              </tr>
                            ))}
                            {isYearExpanded && monthEntries.length > 0 && (
                              <tr key={`${yearKey}-total`} className="month-total-row">
                                <td style={{ paddingLeft: '80px' }}>Total</td>
                                <td className="amount-cell">{formatCurrency(monthTotal)}</td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </>
                  );
                })}
                <tr className="grand-total-row service-name-grand-total">
                  <td>Grand Total</td>
                  <td className="amount-cell">
                    {formatCurrency(financialData.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Financial;

