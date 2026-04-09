import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Download, Moon, Sun, Activity, 
  BarChart3, Wind, Share2, 
  ArrowRight, ShieldCheck, MapPin, Clock, CheckCircle2
} from 'lucide-react';
import { MapContainer, TileLayer, Popup, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import './App.css';

const API_BASE_URL = 'http://127.0.0.1:8000';

const LOCATIONS = [
  { name: 'Gajuwaka', coords: [17.693, 83.219], type: 'Industrial' },
  { name: 'MVP Colony', coords: [17.747, 83.334], type: 'Residential' },
  { name: 'NAD Junction', coords: [17.730, 83.239], type: 'Traffic' },
  { name: 'Rushikonda', coords: [17.822, 83.388], type: 'Coastal' },
  { name: 'Siripuram', coords: [17.712, 83.315], type: 'Commercial' },
  { name: 'Scindia', coords: [17.683, 83.275], type: 'Port' },
  { name: 'Gopalapatnam', coords: [17.755, 83.212], type: 'Transport' },
  { name: 'Pendurthi', coords: [17.810, 83.200], type: 'Suburban' },
  { name: 'Kancharapalem', coords: [17.730, 83.285], type: 'Mixed' },
  { name: 'Mindi', coords: [17.685, 83.205], type: 'Industrial' },
];

interface PredictionData {
  predicted_aqi: number;
  category: string;
  health_suggestion: string;
  reason: string;
  models: { xgboost: number; random_forest: number; };
  accuracy_score: number;
  location: string;
  pollutants?: { name: string; value: number }[];
}

const AirParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
    {[...Array(15)].map((_, i) => (
      <motion.div key={i} className="absolute rounded-full bg-blue-500/20"
        style={{ width: Math.random() * 60 + 20, height: Math.random() * 60 + 20, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
        animate={{ x: [0, Math.random() * 80 - 40, 0], y: [0, Math.random() * 80 - 40, 0], opacity: [0.1, 0.3, 0.1] }}
        transition={{ duration: Math.random() * 20 + 20, repeat: Infinity }}
      />
    ))}
  </div>
);



function App() {
  const [theme, setTheme] = useState('dark');
  const [location, setLocation] = useState('MVP Colony');
  const [compareMode, setCompareMode] = useState(false);
  const [compareLocation, setCompareLocation] = useState('Gajuwaka');
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [timelineValue, setTimelineValue] = useState(10); 
  
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [_compPrediction, setCompPrediction] = useState<PredictionData | null>(null);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const sliderDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + (timelineValue - 10));
    return d.toISOString().split('T')[0];
  }, [timelineValue]);

  useEffect(() => {
    setTargetDate(sliderDate);
  }, [sliderDate]);

  useEffect(() => {
    if (prediction) handlePredict();
  }, [targetDate, location]);

  const handlePredict = async () => {
    setLoading(true);
    try {
      const predRes = await axios.post(`${API_BASE_URL}/predict`, { date: targetDate, location });
      const data = { ...predRes.data, location, pollutants: [
        { name: 'PM2.5', value: Math.round(predRes.data.predicted_aqi * 0.4) },
        { name: 'PM10', value: Math.round(predRes.data.predicted_aqi * 0.7) },
        { name: 'NO2', value: Math.round(predRes.data.predicted_aqi * 0.25) },
        { name: 'SO2', value: Math.round(predRes.data.predicted_aqi * 0.15) },
        { name: 'CO', value: Math.round(predRes.data.predicted_aqi * 0.05) },
      ] };
      setPrediction(data);
      if (compareMode) {
        const compRes = await axios.post(`${API_BASE_URL}/predict`, { date: targetDate, location: compareLocation });
        setCompPrediction({ ...compRes.data, location: compareLocation });
      }
      const forecastRes = await axios.get(`${API_BASE_URL}/forecast_data?limit=500`);
      setForecastData(forecastRes.data.map((d: any) => ({ date: d.Date.split('T')[0], AQI: d.AQI_Forecast }))
        .filter((_: any, i: number) => i % 25 === 0));
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const handleShare = async () => {
    const shareText = `Check out the AI-based AQI Prediction for ${location}: ${prediction?.predicted_aqi} AQI (${prediction?.category}). Forecast for ${targetDate}.`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AQI Intelligence Report',
          text: shareText,
          url: window.location.href,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(shareText + ' ' + window.location.href);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 3000);
    }
  };

  const downloadReport = async () => {
    if (!dashboardRef.current) return;
    setLoading(true);
    try {
      const canvas = await html2canvas(dashboardRef.current, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: theme === 'dark' ? '#020617' : '#f8fafc' 
      });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`AQI_Report_${location}_${targetDate}.pdf`);
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const aqiConfig = useMemo(() => {
    const aqi = prediction?.predicted_aqi || 20;
    if (aqi <= 50) return { color: '#10b981', label: 'Good', bg: 'bg-emerald-500' };
    if (aqi <= 100) return { color: '#fbbf24', label: 'Moderate', bg: 'bg-amber-500' };
    if (aqi <= 200) return { color: '#f97316', label: 'Poor', bg: 'bg-orange-500' };
    return { color: '#ef4444', label: 'Severe', bg: 'bg-red-500' };
  }, [prediction]);

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <AirParticles />
      
      {/* --- HERO TITLE --- */}
      <section className="pt-20 pb-10 px-6 text-center space-y-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
           <div className="inline-block px-4 py-1.5 rounded-full bg-blue-600/10 text-blue-500 text-[10px] font-black uppercase tracking-[0.3em] mb-4">
              ● AQI Intelligence Station
           </div>
           <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4 leading-tight">
             AI-Based Hyperlocal <br />
             <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500">AQI Prediction</span>
           </h1>
           <p className="text-slate-400 dark:text-slate-300 font-medium text-sm md:text-base max-w-xl mx-auto opacity-70">
             Predict air quality for any neighborhood and future timeline in Visakhapatnam.
           </p>
        </motion.div>
      </section>      <main className="max-w-7xl mx-auto px-6 space-y-10 pb-32">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch" ref={dashboardRef}>
          
          {/* Card 1: Control Unit */}
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} className="xl:col-span-3 glass-card p-8 flex flex-col justify-between">
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                      <Wind className="text-white" size={20} />
                    </div>
                    <div>
                       <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-none">Intelligence</h1>
                       <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Station v2.0</span>
                    </div>
                 </div>
                 <button onClick={toggleTheme} className="p-3 rounded-2xl bg-black/5 dark:bg-white/10 hover:scale-110 transition-transform">
                   {theme === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-blue-500" />}
                 </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white ml-1">Central Location</label>
                  <select className="w-full px-5 py-4 rounded-2xl bg-black/10 dark:bg-white/10 border border-white/5 outline-none font-bold text-sm text-slate-900 dark:text-white transition-all focus:border-blue-500" value={location} onChange={(e) => setLocation(e.target.value)}>
                    {LOCATIONS.map(l => <option key={l.name} value={l.name} className="dark:bg-slate-900 dark:text-white text-slate-900">{l.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white ml-1">Select Date</label>
                  <input 
                    type="date" 
                    min={new Date().toISOString().split('T')[0]}
                    max={new Date(new Date().setFullYear(new Date().getFullYear() + 10)).toISOString().split('T')[0]}
                    className="w-full px-5 py-4 rounded-2xl bg-black/10 dark:bg-white/10 border border-white/5 outline-none font-bold text-sm text-slate-900 dark:text-white transition-all focus:border-blue-500" 
                    value={targetDate} 
                    onChange={(e) => setTargetDate(e.target.value)} 
                  />
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-white/5 space-y-4">
              <div className="flex justify-between items-center px-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white">Compare Mode</span>
                <button onClick={() => setCompareMode(!compareMode)} className={`w-11 h-6 rounded-full relative transition-colors ${compareMode ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'}`}>
                  <motion.div animate={{ x: compareMode ? 22 : 4 }} className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-md" />
                </button>
              </div>
              {compareMode && (
                 <select className="w-full px-5 py-3 rounded-xl bg-black/10 dark:bg-white/10 border border-white/5 outline-none font-bold text-xs text-slate-900 dark:text-white" value={compareLocation} onChange={(e) => setCompareLocation(e.target.value)}>
                   {LOCATIONS.map(l => <option key={l.name} value={l.name} className="dark:bg-slate-900 dark:text-white text-slate-900">{l.name}</option>)}
                 </select>
              )}
              <button onClick={handlePredict} disabled={loading} className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest hover:shadow-2xl hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-2">
                {loading ? 'Processing...' : 'Analyze Atmosphere'}
              </button>
            </div>
          </motion.div>

          {/* Card 2: Primary Prediction Result / Comparison */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="xl:col-span-6 glass-card p-10 flex flex-col justify-between min-h-[500px]">
            <AnimatePresence mode="wait">
              {!prediction ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                  <Activity size={48} className="animate-pulse text-blue-500" />
                  <p className="font-black text-sm uppercase tracking-widest text-slate-900 dark:text-white">Awaiting Parameters</p>
                </div>
              ) : (
                <motion.div key={prediction.location + (compareMode ? '_comp' : '')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                        <MapPin size={24} className="text-blue-500" /> {compareMode ? 'Comparison Intel' : `${prediction.location} Outlook`}
                      </h2>
                      <p className="text-xs font-bold text-slate-500 dark:text-white tracking-widest uppercase mt-1">{targetDate} Intelligence</p>
                    </div>
                    <div className="text-right">
                       <p className="text-2xl font-black text-slate-900 dark:text-white">{prediction.accuracy_score.toFixed(1)}%</p>
                       <p className="text-[9px] font-black text-slate-600 dark:text-white uppercase tracking-widest">Confidence</p>
                    </div>
                  </div>

                  <div className={`flex ${compareMode ? 'flex-col lg:flex-row' : ''} items-center gap-10 lg:gap-20 my-10 transition-all`}>
                     <div className="flex flex-col items-center gap-4 flex-1 min-w-0">
                       <span className={`font-black tracking-tighter transition-all duration-700 shrink-0 ${compareMode ? 'text-7xl xl:text-8xl' : 'text-8xl xl:text-9xl'}`} style={{ color: aqiConfig.color, textShadow: theme === 'dark' ? `0 0 50px ${aqiConfig.color}66` : `2px 2px 0px rgba(255,255,255,0.8)` }}>
                         {prediction.predicted_aqi}
                       </span>
                       <div className="flex flex-col items-center gap-2 text-center w-full px-4">
                         <span className="text-xs font-black uppercase text-slate-900 dark:text-white truncate max-w-full">
                           {prediction.location}
                         </span>
                         <div className="px-4 py-1.5 rounded-xl bg-opacity-20 font-black text-[11px] uppercase tracking-widest inline-block whitespace-nowrap" style={{ color: aqiConfig.color, backgroundColor: aqiConfig.color + '33', border: `1.5px solid ${aqiConfig.color}55` }}>
                            {aqiConfig.label}
                         </div>
                       </div>
                     </div>

                     {compareMode && _compPrediction && (
                        <>
                          <div className="w-full h-[1px] lg:w-[1px] lg:h-40 bg-black/5 dark:bg-white/20" />
                          <div className="flex flex-col items-center gap-4 flex-1 min-w-0">
                             <span className="text-6xl xl:text-7xl font-black tracking-tighter text-slate-900 dark:text-white shrink-0" style={{ 
                               color: theme === 'dark' ? '#ffffff' : _compPrediction.predicted_aqi <= 50 ? '#10b981' : _compPrediction.predicted_aqi <= 100 ? '#fbbf24' : _compPrediction.predicted_aqi <= 200 ? '#f97316' : '#ef4444',
                             }}>
                               {_compPrediction.predicted_aqi}
                             </span>
                             <div className="flex flex-col items-center gap-2 text-center w-full px-4">
                               <span className="text-xs font-black uppercase text-slate-900 dark:text-white truncate max-w-full">
                                 {_compPrediction.location}
                               </span>
                               <div className="px-4 py-1.5 rounded-xl bg-opacity-20 font-bold text-[11px] uppercase tracking-widest inline-block whitespace-nowrap" style={{ 
                                 color: _compPrediction.predicted_aqi <= 50 ? '#10b981' : _compPrediction.predicted_aqi <= 100 ? '#fbbf24' : _compPrediction.predicted_aqi <= 200 ? '#f97316' : '#ef4444', 
                                 backgroundColor: (_compPrediction.predicted_aqi <= 50 ? '#10b981' : '#fbbf24') + '33', 
                                 border: `1.5px solid ${(_compPrediction.predicted_aqi <= 50 ? '#10b981' : '#fbbf24')}55` 
                               }}>
                                  {_compPrediction.category}
                               </div>
                             </div>
                          </div>
                        </>
                     )}
                  </div>

                  <div className="p-8 rounded-[2.5rem] bg-blue-600/5 dark:bg-white/5 border border-blue-500/10 space-y-5">
                     <div className="flex items-center gap-3 text-blue-500">
                        <ShieldCheck size={22} /> <span className="text-[11px] font-black uppercase tracking-[0.3em]">AI Perception & Safety</span>
                     </div>
                     <p className="text-sm font-bold leading-relaxed italic text-slate-700 dark:text-white">
                       {compareMode && _compPrediction ? `Simultaneous Analysis: ${prediction.location} is ${prediction.category}, while ${_compPrediction.location} is ${_compPrediction.category}.` : prediction.health_suggestion}
                     </p>
                     
                     <div className="pt-4 border-t border-white/5 flex flex-col gap-3">
                        <div className="flex items-center gap-3 text-blue-500 dark:text-blue-400">
                           <Activity size={18} /> <span className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Attribution Reason (Project Core)</span>
                        </div>
                        <p className="text-sm font-medium text-slate-600 dark:text-white leading-relaxed bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10 italic">
                           "{prediction.reason}"
                        </p>
                     </div>
                  </div>

                  {!compareMode && (
                    <div className="flex gap-4 mt-6">
                      <button onClick={handleShare} className="flex-1 py-3 rounded-xl bg-black/5 dark:bg-white/10 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/20 transition-all text-slate-900 dark:text-white">
                         <Share2 size={14} /> Share
                      </button>
                      <button onClick={downloadReport} className="flex-[2] py-3 rounded-xl bg-black/5 dark:bg-white/10 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/20 transition-all text-slate-900 dark:text-white">
                         <Download size={14} /> Download Intelligence Report
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Card 3: Pollutant Imprint */}
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="xl:col-span-3 glass-card p-8 flex flex-col">
            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-white mb-8">Pollutant Imprint</h3>
            
            <div className="space-y-8 flex-1 flex flex-col justify-center">
              {prediction?.pollutants?.map(p => (
                <div key={p.name} className="space-y-3">
                   <div className="flex justify-between items-end">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-800 dark:text-white">{p.name}</span>
                    <span className="text-xs font-bold font-mono text-slate-600 dark:text-white">{p.value} µg/m³</span>
                  </div>
                  <div className="h-1.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min((p.value / 250) * 100, 100)}%` }} className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 text-center">
              <button className="text-[10px] font-black uppercase tracking-widest text-blue-500 flex items-center justify-center gap-2 mx-auto hover:gap-4 transition-all">
                Detailed Breakdown <ArrowRight size={14} />
              </button>
            </div>
          </motion.div>

        </div>

        {/* --- SECONDARY ROW: MAP & FORECAST --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[450px]">
           <div className="glass-card overflow-hidden relative">
              <MapContainer center={[17.729, 83.308]} zoom={12} style={{ height: '100%', width: '100%' }}>
                <TileLayer url={`https://{s}.basemaps.cartocdn.com/${theme === 'dark' ? 'dark_all' : 'rastertiles/voyager'}/{z}/{x}/{y}{r}.png`} />
                {LOCATIONS.map(loc => (
                  <CircleMarker key={loc.name} center={loc.coords as [number, number]} radius={loc.name === location ? 18 : 10} pathOptions={{ color: loc.name === location ? aqiConfig.color : '#3b82f6', fillColor: loc.name === location ? aqiConfig.color : '#3b82f6', fillOpacity: 1, stroke: false }}>
                    <Popup>
                      <div className="font-bold p-1">
                        <p className="text-blue-500">{loc.name}</p>
                        {loc.name === location && prediction && <p className="text-xs" style={{ color: aqiConfig.color }}>{prediction.predicted_aqi} AQI</p>}
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
           </div>
           
           <div className="glass-card p-8 flex flex-col min-h-[450px]">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] flex items-center gap-2"><BarChart3 size={16} /> 10Y Atmospheric Trend</h3>
                <span className="text-[9px] font-black px-3 py-1 bg-white/5 rounded-full opacity-50">FORECAST MODE</span>
              </div>
              <div className="flex-1 w-full min-h-[300px] relative">
                 <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                     <defs>
                       <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                         <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#ffffff0a' : '#0000000a'} />
                     <XAxis dataKey="date" hide />
                     <YAxis hide domain={['auto', 'auto']} />
                     <RechartsTooltip contentStyle={{ borderRadius: '15px', border: 'none', background: theme === 'dark' ? '#1e293b' : '#fff', fontWeight: 'bold' }} />
                     <Area type="monotone" dataKey="AQI" stroke="#3b82f6" strokeWidth={3} fill="url(#chartGrad)" />
                   </AreaChart>
                 </ResponsiveContainer>
              </div>
           </div>
        </div>

        {/* --- TIMELINE SLIDER (UNIQUE FEATURE) --- */}
        <section className="glass-card p-10 space-y-10">
           <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="text-center md:text-left">
                <h3 className="text-2xl font-black flex items-center justify-center md:justify-start gap-3 tracking-tight">
                  <Clock size={28} className="text-blue-500" /> Historical & Future Timeline
                </h3>
                <p className="text-sm font-bold text-slate-500 max-w-sm">Sweep through 20 years of atmospheric intelligence</p>
              </div>
              <div className="px-8 py-3 rounded-3xl bg-blue-600 text-white font-black text-2xl shadow-2xl shadow-blue-500/40 transform hover:scale-105 transition-all">
                {sliderDate.split('-')[0]} Perspective
              </div>
           </div>
           
           <div className="relative pt-4">
              <input type="range" min="0" max="20" step="1" className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500" value={timelineValue} onChange={(e) => setTimelineValue(parseInt(e.target.value))} />
              <div className="flex justify-between mt-8 text-[10px] font-black text-slate-500 dark:text-white tracking-[0.4em]">
                <span>2014 LAUNCH</span>
                <span className="text-blue-500">BASELINE NOW</span>
                <span>2034 HORIZON</span>
              </div>
           </div>
        </section>

      </main>

      {/* --- FOOTER / FLOATING BAR --- */}
      <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 glass-card py-4 px-10 flex items-center gap-8 shadow-2xl border-white/10 z-[1000]">
        <button onClick={handleShare} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest hover:text-blue-500 transition-colors">
          <Share2 size={16} /> Share
        </button>
        <div className="w-[1px] h-6 bg-white/10" />
        <button onClick={downloadReport} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest hover:text-blue-500 transition-colors">
          <Download size={16} /> Download Intelligence Report
        </button>
      </footer>

      <AnimatePresence>
        {showShareToast && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="share-toast flex items-center gap-3">
            <CheckCircle2 className="text-green-400" size={18} /> REPORT COPIED TO CLIPBOARD
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
