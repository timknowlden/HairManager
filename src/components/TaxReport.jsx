import { useState, useEffect, useMemo, useRef } from 'react';
import { FaFileAlt, FaDownload, FaChevronDown, FaChevronUp, FaCar, FaReceipt, FaPoundSign } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import './TaxReport.css';
import { API_BASE } from '../config.js';

function TaxReport() {
  const { getAuthHeaders } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    income: true, mileage: true, expenses: true, sa103: true
  });
  const reportRef = useRef(null);

  const taxYears = useMemo(() => {
    const years = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const currentTaxYearStart = (month < 3 || (month === 3 && day < 6)) ? currentYear - 1 : currentYear;
    for (let y = currentTaxYearStart; y >= currentTaxYearStart - 5; y--) {
      years.push({ value: y.toString(), label: `${y}/${y + 1}` });
    }
    return years;
  }, []);

  useEffect(() => {
    if (taxYears.length > 0 && !selectedYear) {
      // Default to previous tax year (most likely the one being filed)
      setSelectedYear(taxYears.length > 1 ? taxYears[1].value : taxYears[0].value);
    }
  }, [taxYears]);

  useEffect(() => {
    if (selectedYear) fetchReport();
  }, [selectedYear]);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/financial/tax-report/${selectedYear}`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch tax report');
      const data = await response.json();
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount || 0);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading && !report) {
    return <div className="loading">Loading tax report...</div>;
  }

  return (
    <div className="tax-report" ref={reportRef}>
      <div className="tax-report-header">
        <div className="tax-report-title">
          <h2><FaFileAlt style={{ marginRight: 8 }} /> Self-Assessment Tax Report</h2>
          <p>UK Self-Employment (SA103) Summary</p>
        </div>
        <div className="tax-report-controls">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="tax-year-select"
          >
            {taxYears.map(ty => (
              <option key={ty.value} value={ty.value}>{ty.label}</option>
            ))}
          </select>
          {report && (
            <button onClick={handlePrint} className="print-btn">
              <FaDownload /> Print / Save PDF
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {report && (
        <>
          {/* SA103 Summary - at the top */}
          <div className="report-section sa103-section">
            <div className="section-header-bar" onClick={() => toggleSection('sa103')}>
              <h3><FaPoundSign /> SA103 Summary — Tax Year {report.sa103.taxYear}</h3>
              {expandedSections.sa103 ? <FaChevronUp /> : <FaChevronDown />}
            </div>
            {expandedSections.sa103 && (
              <div className="sa103-grid">
                <div className="sa103-row">
                  <span className="sa103-box">Box 9</span>
                  <span className="sa103-label">Turnover (total income)</span>
                  <span className="sa103-value">{formatCurrency(report.sa103.box9_turnover)}</span>
                </div>
                <div className="sa103-row">
                  <span className="sa103-box">Box 17</span>
                  <span className="sa103-label">Travel costs (mileage allowance)</span>
                  <span className="sa103-value">{formatCurrency(report.sa103.box17_travelCosts)}</span>
                </div>
                <div className="sa103-row">
                  <span className="sa103-box">Box 20</span>
                  <span className="sa103-label">Other business expenses</span>
                  <span className="sa103-value">{formatCurrency(report.sa103.box20_otherExpenses)}</span>
                </div>
                <div className="sa103-row total">
                  <span className="sa103-box">Box 27</span>
                  <span className="sa103-label">Total allowable expenses</span>
                  <span className="sa103-value">{formatCurrency(report.sa103.box27_totalAllowableExpenses)}</span>
                </div>
                <div className="sa103-row net-profit">
                  <span className="sa103-box">Box 29</span>
                  <span className="sa103-label">Net profit</span>
                  <span className="sa103-value">{formatCurrency(report.sa103.box29_netProfit)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Income Section */}
          <div className="report-section">
            <div className="section-header-bar" onClick={() => toggleSection('income')}>
              <h3><FaPoundSign /> Income</h3>
              <div className="section-summary">
                <span className="summary-value">{formatCurrency(report.income.total)}</span>
                <span className="summary-count">{report.income.appointmentCount} appointments</span>
                {expandedSections.income ? <FaChevronUp /> : <FaChevronDown />}
              </div>
            </div>
            {expandedSections.income && (
              <div className="section-content">
                <div className="income-stats">
                  <div className="stat-pill paid">Paid: {formatCurrency(report.income.paid)}</div>
                  <div className="stat-pill unpaid">Unpaid: {formatCurrency(report.income.unpaid)}</div>
                </div>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Appointments</th>
                      <th>Income</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.income.monthly.map(m => (
                      <tr key={m.key}>
                        <td>{m.label}</td>
                        <td>{m.count}</td>
                        <td className="amount-cell">{formatCurrency(m.total)}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td><strong>Total</strong></td>
                      <td><strong>{report.income.appointmentCount}</strong></td>
                      <td className="amount-cell"><strong>{formatCurrency(report.income.total)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Mileage Section */}
          <div className="report-section">
            <div className="section-header-bar" onClick={() => toggleSection('mileage')}>
              <h3><FaCar /> Mileage</h3>
              <div className="section-summary">
                <span className="summary-value">{formatCurrency(report.mileage.mileageAllowance)}</span>
                <span className="summary-count">{report.mileage.totalMiles.toFixed(1)} miles</span>
                {expandedSections.mileage ? <FaChevronUp /> : <FaChevronDown />}
              </div>
            </div>
            {expandedSections.mileage && (
              <div className="section-content">
                <div className="mileage-calc">
                  <div className="mileage-rate">
                    <span>{report.mileage.milesAt45p.toFixed(1)} miles @ 45p</span>
                    <span>{formatCurrency(report.mileage.milesAt45p * 0.45)}</span>
                  </div>
                  {report.mileage.milesAt25p > 0 && (
                    <div className="mileage-rate">
                      <span>{report.mileage.milesAt25p.toFixed(1)} miles @ 25p</span>
                      <span>{formatCurrency(report.mileage.milesAt25p * 0.25)}</span>
                    </div>
                  )}
                  <div className="mileage-rate total">
                    <span><strong>Total mileage allowance</strong></span>
                    <span><strong>{formatCurrency(report.mileage.mileageAllowance)}</strong></span>
                  </div>
                </div>

                <h4>By Location</h4>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Distance (one way)</th>
                      <th>Trips</th>
                      <th>Total Miles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.mileage.byLocation.map(loc => (
                      <tr key={loc.location}>
                        <td>{loc.location}</td>
                        <td>{loc.distanceOneWay} mi</td>
                        <td>{loc.trips}</td>
                        <td>{loc.totalMiles.toFixed(1)} mi</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td colSpan="2"><strong>Total</strong></td>
                      <td><strong>{report.mileage.tripCount}</strong></td>
                      <td><strong>{report.mileage.totalMiles.toFixed(1)} mi</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Expenses Section */}
          <div className="report-section">
            <div className="section-header-bar" onClick={() => toggleSection('expenses')}>
              <h3><FaReceipt /> Expenses</h3>
              <div className="section-summary">
                <span className="summary-value">{formatCurrency(report.expenses.total)}</span>
                <span className="summary-count">{report.expenses.count} items</span>
                {expandedSections.expenses ? <FaChevronUp /> : <FaChevronDown />}
              </div>
            </div>
            {expandedSections.expenses && (
              <div className="section-content">
                {report.expenses.byCategory.length > 0 ? (
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Items</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.expenses.byCategory.map(cat => (
                        <tr key={cat.category}>
                          <td>{cat.category}</td>
                          <td>{cat.count}</td>
                          <td className="amount-cell">{formatCurrency(cat.total)}</td>
                        </tr>
                      ))}
                      <tr className="total-row">
                        <td><strong>Total</strong></td>
                        <td><strong>{report.expenses.count}</strong></td>
                        <td className="amount-cell"><strong>{formatCurrency(report.expenses.total)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="no-data-message">No expenses recorded for this tax year</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default TaxReport;
