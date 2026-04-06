import { useState, useEffect, useMemo, useRef } from 'react';
import { FaFileAlt, FaDownload, FaChevronDown, FaChevronUp, FaCar, FaReceipt, FaPoundSign, FaPencilAlt } from 'react-icons/fa';
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
  const [mileageRate, setMileageRate] = useState(0.45);
  const [mileageRateOver10k, setMileageRateOver10k] = useState(0.25);
  const [editingMileageRate, setEditingMileageRate] = useState(false);
  // UK tax allowances (2025/26 defaults)
  const [personalAllowance, setPersonalAllowance] = useState(12570);
  const [basicRate, setBasicRate] = useState(0.20);
  const [basicRateLimit, setBasicRateLimit] = useState(50270);
  const [higherRate, setHigherRate] = useState(0.40);
  const [niThreshold, setNiThreshold] = useState(12570);
  const [niRate, setNiRate] = useState(0.06);
  const [editingTaxRates, setEditingTaxRates] = useState(false);
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

  // Recalculate mileage with custom rates
  const mileageCalc = useMemo(() => {
    if (!report?.mileage) return null;
    const totalMiles = report.mileage.totalMiles;
    const milesAt1 = Math.min(totalMiles, 10000);
    const milesAt2 = Math.max(0, totalMiles - 10000);
    const allowance = (milesAt1 * mileageRate) + (milesAt2 * mileageRateOver10k);
    return { milesAt1, milesAt2, allowance };
  }, [report, mileageRate, mileageRateOver10k]);

  // Recalculate SA103 with custom mileage
  const sa103Calc = useMemo(() => {
    if (!report?.sa103 || !mileageCalc) return null;
    const paidIncome = report.income.paid;
    const totalAllowable = report.expenses.total + mileageCalc.allowance;
    return {
      ...report.sa103,
      box9_turnover: paidIncome,
      box17_travelCosts: mileageCalc.allowance,
      box27_totalAllowableExpenses: totalAllowable,
      box29_netProfit: paidIncome - totalAllowable
    };
  }, [report, mileageCalc]);

  // Estimated tax bill
  const taxEstimate = useMemo(() => {
    if (!sa103Calc) return null;
    const netProfit = sa103Calc.box29_netProfit;
    if (netProfit <= 0) return { incomeTax: 0, nationalInsurance: 0, total: 0, netProfit };

    // Income tax
    const taxableIncome = Math.max(0, netProfit - personalAllowance);
    const basicBand = Math.min(taxableIncome, basicRateLimit - personalAllowance);
    const higherBand = Math.max(0, taxableIncome - (basicRateLimit - personalAllowance));
    const incomeTax = (basicBand * basicRate) + (higherBand * higherRate);

    // Class 4 NI
    const niableProfit = Math.max(0, netProfit - niThreshold);
    const nationalInsurance = niableProfit * niRate;

    return {
      netProfit,
      taxableIncome,
      incomeTax,
      nationalInsurance,
      total: incomeTax + nationalInsurance,
      takeHome: netProfit - incomeTax - nationalInsurance
    };
  }, [sa103Calc, personalAllowance, basicRate, basicRateLimit, higherRate, niThreshold, niRate]);

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
          {sa103Calc && (
          <div className="report-section sa103-section">
            <div className="section-header-bar" onClick={() => toggleSection('sa103')}>
              <h3><FaPoundSign /> SA103 Summary — Tax Year {report.sa103.taxYear}</h3>
              {expandedSections.sa103 ? <FaChevronUp /> : <FaChevronDown />}
            </div>
            {expandedSections.sa103 && (
              <div className="sa103-grid">
                <div className="sa103-row">
                  <span className="sa103-box">Box 9</span>
                  <span className="sa103-label">Turnover (paid income only)</span>
                  <span className="sa103-value">{formatCurrency(sa103Calc.box9_turnover)}</span>
                </div>
                <div className="sa103-row">
                  <span className="sa103-box">Box 17</span>
                  <span className="sa103-label">Travel costs (mileage allowance)</span>
                  <span className="sa103-value">{formatCurrency(sa103Calc.box17_travelCosts)}</span>
                </div>
                <div className="sa103-row">
                  <span className="sa103-box">Box 20</span>
                  <span className="sa103-label">Other business expenses</span>
                  <span className="sa103-value">{formatCurrency(sa103Calc.box20_otherExpenses)}</span>
                </div>
                <div className="sa103-row total">
                  <span className="sa103-box">Box 27</span>
                  <span className="sa103-label">Total allowable expenses</span>
                  <span className="sa103-value">{formatCurrency(sa103Calc.box27_totalAllowableExpenses)}</span>
                </div>
                <div className="sa103-row net-profit">
                  <span className="sa103-box">Box 29</span>
                  <span className="sa103-label">Net profit</span>
                  <span className="sa103-value">{formatCurrency(sa103Calc.box29_netProfit)}</span>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Tax Estimate */}
          {taxEstimate && (
          <div className="report-section tax-estimate-section">
            <div className="section-header-bar" onClick={() => toggleSection('taxEstimate')}>
              <h3><FaPoundSign /> Estimated Tax Bill</h3>
              <div className="section-summary">
                <span className="summary-value">{formatCurrency(taxEstimate.total)}</span>
                <button className="edit-rate-btn" onClick={(e) => { e.stopPropagation(); setEditingTaxRates(!editingTaxRates); }} title="Edit rates">
                  <FaPencilAlt />
                </button>
                {expandedSections.taxEstimate ? <FaChevronUp /> : <FaChevronDown />}
              </div>
            </div>
            {expandedSections.taxEstimate !== false && (
              <div className="section-content">
                <p className="tax-estimate-disclaimer">Estimate only — based on self-employment income. Does not account for other income, student loans, or other deductions.</p>
                {editingTaxRates && (
                  <div className="tax-rates-editor">
                    <div className="tax-rate-row">
                      <label>Personal Allowance</label>
                      <input type="number" value={personalAllowance} onChange={e => setPersonalAllowance(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="tax-rate-row">
                      <label>Basic Rate (%)</label>
                      <input type="number" step="0.01" value={(basicRate * 100).toFixed(0)} onChange={e => setBasicRate((parseFloat(e.target.value) || 0) / 100)} />
                    </div>
                    <div className="tax-rate-row">
                      <label>Basic Rate Limit</label>
                      <input type="number" value={basicRateLimit} onChange={e => setBasicRateLimit(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="tax-rate-row">
                      <label>Higher Rate (%)</label>
                      <input type="number" step="0.01" value={(higherRate * 100).toFixed(0)} onChange={e => setHigherRate((parseFloat(e.target.value) || 0) / 100)} />
                    </div>
                    <div className="tax-rate-row">
                      <label>NI Threshold</label>
                      <input type="number" value={niThreshold} onChange={e => setNiThreshold(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="tax-rate-row">
                      <label>Class 4 NI Rate (%)</label>
                      <input type="number" step="0.01" value={(niRate * 100).toFixed(0)} onChange={e => setNiRate((parseFloat(e.target.value) || 0) / 100)} />
                    </div>
                  </div>
                )}
                <div className="tax-breakdown">
                  <div className="tax-row">
                    <span>Net profit</span>
                    <span>{formatCurrency(taxEstimate.netProfit)}</span>
                  </div>
                  <div className="tax-row">
                    <span>Less personal allowance ({formatCurrency(personalAllowance)})</span>
                    <span>{formatCurrency(taxEstimate.taxableIncome)}</span>
                  </div>
                  <div className="tax-row">
                    <span>Income tax ({(basicRate * 100).toFixed(0)}%)</span>
                    <span>{formatCurrency(taxEstimate.incomeTax)}</span>
                  </div>
                  <div className="tax-row">
                    <span>Class 4 NI ({(niRate * 100).toFixed(0)}%)</span>
                    <span>{formatCurrency(taxEstimate.nationalInsurance)}</span>
                  </div>
                  <div className="tax-row total">
                    <span><strong>Estimated tax bill</strong></span>
                    <span><strong>{formatCurrency(taxEstimate.total)}</strong></span>
                  </div>
                  <div className="tax-row take-home">
                    <span><strong>Estimated take-home</strong></span>
                    <span><strong>{formatCurrency(taxEstimate.takeHome)}</strong></span>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Income Section */}
          <div className="report-section">
            <div className="section-header-bar" onClick={() => toggleSection('income')}>
              <h3><FaPoundSign /> Income</h3>
              <div className="section-summary">
                <span className="summary-value">{formatCurrency(report.income.paid)}</span>
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
                <span className="summary-value">{formatCurrency(mileageCalc?.allowance || 0)}</span>
                <span className="summary-count">{report.mileage.totalMiles.toFixed(1)} miles</span>
                {expandedSections.mileage ? <FaChevronUp /> : <FaChevronDown />}
              </div>
            </div>
            {expandedSections.mileage && (
              <div className="section-content">
                {mileageCalc && (
                <div className="mileage-calc">
                  <div className="mileage-rate">
                    <span>
                      {mileageCalc.milesAt1.toFixed(1)} miles @{' '}
                      {editingMileageRate ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={mileageRate}
                          onChange={(e) => setMileageRate(parseFloat(e.target.value) || 0)}
                          className="mileage-rate-input"
                        />
                      ) : (
                        <>{(mileageRate * 100).toFixed(0)}p</>
                      )}
                      {' '}
                      <button className="edit-rate-btn" onClick={() => setEditingMileageRate(!editingMileageRate)} title="Edit rate">
                        <FaPencilAlt />
                      </button>
                    </span>
                    <span>{formatCurrency(mileageCalc.milesAt1 * mileageRate)}</span>
                  </div>
                  {mileageCalc.milesAt2 > 0 && (
                    <div className="mileage-rate">
                      <span>
                        {mileageCalc.milesAt2.toFixed(1)} miles @{' '}
                        {editingMileageRate ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={mileageRateOver10k}
                            onChange={(e) => setMileageRateOver10k(parseFloat(e.target.value) || 0)}
                            className="mileage-rate-input"
                          />
                        ) : (
                          <>{(mileageRateOver10k * 100).toFixed(0)}p</>
                        )}
                      </span>
                      <span>{formatCurrency(mileageCalc.milesAt2 * mileageRateOver10k)}</span>
                    </div>
                  )}
                  <div className="mileage-rate total">
                    <span><strong>Total mileage allowance</strong></span>
                    <span><strong>{formatCurrency(mileageCalc.allowance)}</strong></span>
                  </div>
                </div>
                )}

                <h4>By Location</h4>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Round Trip</th>
                      <th>Trips</th>
                      <th>Total Miles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.mileage.byLocation.map(loc => (
                      <tr key={loc.location}>
                        <td>{loc.location}</td>
                        <td>{loc.roundTripDistance} mi</td>
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
