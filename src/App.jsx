import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Plane, Wallet, Calendar, PlusCircle, Euro, Utensils, ShoppingBag, 
  MapPin, Clock, X, Trash2, Edit, Save, UserPlus, Filter, 
  ChevronLeft, ChevronRight, Sun, Car, Home, Navigation, Users, Check, Search, Globe, Loader2
} from 'lucide-react';

// --- Firebase 模組載入 (為支援Canvas環境，確保使用時機正確) ---
// 這裡保留了 Firebase 相關的 imports，雖然實際的資料操作仍使用本地狀態，
// 但保持結構完整性，並在 useEffect 中處理初始化和認證。
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';


// --- External Styles for Leaflet (Injected dynamically) ---
const loadLeafletStyles = () => {
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
};

// --- Global Constants ---
const EXCHANGE_RATES = {
  TWD: 1,
  USD: 32.0,
  JPY: 0.22,
  EUR: 35.0,
  CNY: 4.5,
};
const CURRENCIES = Object.keys(EXCHANGE_RATES);

const DEFAULT_PAYERS = ['我 (Me)', 'John', 'Jane', 'Max'];

// --- Geocoding Simulation Data and Function ---
const SIMULATED_GEO_DATA = {
  '台北車站': { lat: 25.0478, lng: 121.5170 },
  '士林夜市': { lat: 25.0878, lng: 121.5241 },
  '故宮博物院': { lat: 25.1024, lng: 121.5485 },
  '台北101': { lat: 25.0339, lng: 121.5645 },
  '桃園機場': { lat: 25.0797, lng: 121.2342 },
  '信義區': { lat: 25.0339, lng: 121.5645 },
  '東京車站': { lat: 35.6812, lng: 139.7671 }, 
  '澀谷': { lat: 35.6591, lng: 139.7031 }, 
};

// Simulates an API call to convert location name to coordinates
const geocodeLocation = (locationName) => {
  return new Promise(resolve => {
    // Simulate network delay
    setTimeout(() => {
      const coords = SIMULATED_GEO_DATA[locationName.trim()] || null;
      resolve(coords);
    }, 800);
  });
};

// --- Initial Data ---
const initialExpenses = [
  { id: 1, date: '2025-11-05', category: '交通', description: '高鐵票', amount: 850, currency: 'TWD', inputAmount: 850, inputCurrency: 'TWD', payer: '我 (Me)' },
  { id: 2, date: '2025-11-05', category: '餐飲', description: '午餐 - 義大利麵', amount: 320, currency: 'TWD', inputAmount: 320, inputCurrency: 'TWD', payer: 'John' },
  { id: 3, date: '2025-11-06', category: '住宿', description: '飯店一晚 (10000 JPY)', amount: 2200, currency: 'TWD', inputAmount: 10000, inputCurrency: 'JPY', payer: '我 (Me)' },
  { id: 4, date: '2025-11-06', category: '購物', description: '紀念品', amount: 650, currency: 'TWD', inputAmount: 650, inputCurrency: 'TWD', payer: 'Jane' },
];

const initialItinerary = [
  { date: '2025-11-05', activities: [
    { id: 'a1', time: '09:00', icon: 'Plane', description: '桃園機場出發 (TPE)', location: '桃園機場', lat: 25.0797, lng: 121.2342 },
    { id: 'a2', time: '12:00', icon: 'MapPin', description: '抵達目的地並辦理入住', location: '台北車站', lat: 25.0478, lng: 121.5170 },
    { id: 'a3', time: '19:00', icon: 'Utensils', description: '夜市觀光與晚餐', location: '士林夜市', lat: 25.0878, lng: 121.5241 },
  ]},
  { date: '2025-11-06', activities: [
    { id: 'a4', time: '09:30', icon: 'MapPin', description: '參觀歷史博物館', location: '故宮博物院', lat: 25.1024, lng: 121.5485 },
    { id: 'a5', time: '13:00', icon: 'ShoppingBag', description: '市區購物區自由活動', location: '信義區', lat: 25.0339, lng: 121.5645 },
    { id: 'a6', time: '18:30', icon: 'Utensils', description: '高級晚餐體驗', location: '台北101', lat: 25.0339, lng: 121.5645 },
  ]},
];

const TRAVEL_INFO = {
  destination: '台北 • 日本',
  dateRange: '2025/11/05 - 2025/11/08'
};

// --- Helper Functions ---
const formatDate = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStartOfWeek = (dateString) => {
  const date = new Date(dateString + 'T00:00:00');
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return formatDate(date);
};

// Icon Mapping
const ICON_MAP = {
  Plane, Wallet, Calendar, PlusCircle, Euro, Utensils, ShoppingBag, MapPin, Clock, X, Trash2, Edit, Save, UserPlus, Filter, ChevronLeft, ChevronRight, Sun, Car, Home, Navigation, Users, Check, Search, Globe, Loader2
};

const getCategoryIcon = (category) => {
  switch (category) {
    case '交通': return Plane;
    case '餐飲': return Utensils;
    case '住宿': return Home;
    case '購物': return ShoppingBag;
    default: return Wallet;
  }
};

const getActivityIcon = (iconName) => {
  return ICON_MAP[iconName] || MapPin;
};

// --- Components ---

// 1. Map Component (Leaflet)
const MapView = ({ itinerary }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Collect all activities that have coordinates
  const points = useMemo(() => {
    return itinerary.flatMap(day => 
      day.activities.filter(act => act.lat && act.lng)
    );
  }, [itinerary]);

  // Use a state to track Leaflet script loading
  const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);

  useEffect(() => {
    loadLeafletStyles();
    
    // Load Leaflet Script dynamically
    if (!window.L || typeof window.L.map !== 'function') {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => {
             // 載入後，再次檢查 L 及其方法是否可用
             if (window.L && typeof window.L.map === 'function') {
                 setIsLeafletLoaded(true);
             } else {
                 // 添加一個小延遲，確保在某些環境下 L 完全初始化
                 setTimeout(() => {
                     if (window.L && typeof window.L.map === 'function') {
                         setIsLeafletLoaded(true);
                     }
                 }, 50); 
             }
        };
        document.body.appendChild(script);
    } else if (typeof window.L.map === 'function') { // 如果已經載入且準備好
        setIsLeafletLoaded(true);
    }

    return () => {
      // Cleanup map on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const initMap = useCallback(() => {
    // 關鍵修復: 再次檢查 window.L.map 是否為函式，避免 TypeError
    if (!mapRef.current || !window.L || typeof window.L.map !== 'function' || mapInstanceRef.current) return;

    // Default to Taipei
    const map = window.L.map(mapRef.current).setView([25.0330, 121.5654], 12);
    
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    mapInstanceRef.current = map;
    updateMarkers(map, points);
  }, [points]);

  const updateMarkers = useCallback((map, currentPoints) => {
    if (!map || !window.L) return;

    // Clear existing markers
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];

    const bounds = window.L.latLngBounds();
    let hasMarkers = false;

    currentPoints.forEach(act => {
      if (act.lat && act.lng) {
        const marker = window.L.marker([act.lat, act.lng])
          .addTo(map)
          .bindPopup(`<b>${act.description}</b><br>${act.time} - ${act.location}`);
        markersRef.current.push(marker);
        bounds.extend([act.lat, act.lng]);
        hasMarkers = true;
      }
    });

    if (hasMarkers) {
      // Fit map to markers, but only if the map is not already displaying them closely
      if (!map.getBounds().contains(bounds.getCenter())) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }
  }, []);
  
  // Initialize map once Leaflet is loaded
  useEffect(() => {
    if (isLeafletLoaded) {
      initMap();
    }
  }, [isLeafletLoaded, initMap]);

  // Update markers when itinerary/points change
  useEffect(() => {
    if (mapInstanceRef.current && window.L) {
      updateMarkers(mapInstanceRef.current, points);
    }
  }, [points, updateMarkers]);

  if (!isLeafletLoaded) {
    return (
        <div className="flex flex-col items-center justify-center w-full h-full min-h-[60vh] bg-gray-100 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="mt-2">地圖元件載入中...</p>
        </div>
    );
  }

  return <div ref={mapRef} className="w-full h-full min-h-[60vh] bg-gray-100 z-0" />;
};

// 2. Expense Components
const ExpenseItem = ({ expense, onEdit }) => {
  const Icon = getCategoryIcon(expense.category);
  const isConverted = expense.inputCurrency && expense.inputCurrency !== 'TWD';
  
  return (
    <div 
      className="flex items-center justify-between p-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100 mb-3 active:scale-[0.98] transition-transform duration-200 cursor-pointer"
      onClick={() => onEdit(expense)}
    >
      <div className="flex items-center gap-4">
        <div className="p-3 bg-blue-50 rounded-full text-blue-600">
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-base">{expense.description}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{expense.category}</span>
            <span className="text-xs text-gray-400">{expense.date} · {expense.payer}</span>
          </div>
          {isConverted && (
            <p className="text-xs text-blue-500 mt-0.5">
              原價: {expense.inputAmount.toLocaleString()} {expense.inputCurrency}
            </p>
          )}
        </div>
      </div>
      <div className="text-right">
        <p className="font-bold text-gray-900 text-lg">
          -{expense.amount.toLocaleString()} <span className="text-sm font-medium text-gray-500">TWD</span>
        </p>
      </div>
    </div>
  );
};

// 3. Calendar Components
const RangeCalendar = ({ startDate, endDate, onSelectDate }) => {
  const initialDate = startDate ? new Date(startDate) : new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const renderMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    // Empty cells
    for (let i = 0; i < firstDay; i++) days.push(<div key={`e-${i}`} className="h-10"></div>);

    const start = startDate ? new Date(startDate + 'T00:00:00') : null;
    const end = endDate ? new Date(endDate + 'T00:00:00') : null;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDate(new Date(year, month, d));
      const current = new Date(dateStr + 'T00:00:00');
      
      let bgClass = "bg-transparent text-gray-700";
      let shapeClass = "rounded-full";
      
      const isStart = dateStr === startDate;
      const isEnd = dateStr === endDate;
      const isRange = start && end && current > start && current < end;

      if (isStart || isEnd) {
        bgClass = "bg-blue-600 text-white shadow-md z-10 relative";
      } else if (isRange) {
        bgClass = "bg-blue-100 text-blue-700";
        shapeClass = ""; // Continuous connection
      }

      // Connect visuals
      let connectionClass = "";
      if (isRange) connectionClass = "bg-blue-100 w-full h-full absolute top-0 left-0";
      if (isStart && end) connectionClass = "bg-blue-100 w-1/2 h-full absolute top-0 right-0 z-0";
      if (isEnd && start) connectionClass = "bg-blue-100 w-1/2 h-full absolute top-0 left-0 z-0";

      days.push(
        <div key={dateStr} className="relative h-10 flex items-center justify-center cursor-pointer" onClick={() => onSelectDate(dateStr)}>
          <div className={connectionClass}></div>
          <div className={`w-8 h-8 flex items-center justify-center text-sm font-medium ${shapeClass} ${bgClass}`}>
            {d}
          </div>
        </div>
      );
    }
    return days;
  };

  return (
    <div className="p-2">
      <div className="flex justify-between items-center mb-4 px-2">
        <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft className="w-5 h-5"/></button>
        <span className="font-bold text-gray-800">{currentMonth.getFullYear()}年 {currentMonth.getMonth()+1}月</span>
        <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight className="w-5 h-5"/></button>
      </div>
      <div className="grid grid-cols-7 text-center mb-2 text-xs font-semibold text-gray-400">
        <div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
      </div>
      <div className="grid grid-cols-7 text-center gap-y-1">
        {renderMonth()}
      </div>
    </div>
  );
};

const WeeklyCalendar = ({ selectedDate, onDateSelect }) => {
  const [refDate, setRefDate] = useState(selectedDate);
  
  useEffect(() => setRefDate(selectedDate), [selectedDate]);

  const weekStart = getStartOfWeek(refDate);
  const weekDays = useMemo(() => {
    const start = new Date(weekStart + 'T00:00:00');
    return Array.from({length: 7}).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        dateStr: formatDate(d),
        day: d.getDate(),
        weekDay: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
      };
    });
  }, [weekStart]);

  const changeWeek = (offset) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + (offset * 7));
    setRefDate(formatDate(d));
  };

  return (
    <div className="bg-white/90 backdrop-blur-md sticky top-[76px] z-30 shadow-sm border-b border-gray-100 pb-2">
      <div className="flex items-center justify-between px-4 py-2">
        <button onClick={() => changeWeek(-1)} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft className="w-5 h-5 text-gray-500"/></button>
        <span className="text-sm font-semibold text-gray-700">{weekStart} ~ {formatDate(new Date(new Date(weekStart).setDate(new Date(weekStart).getDate()+6)))}</span>
        <button onClick={() => changeWeek(1)} className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight className="w-5 h-5 text-gray-500"/></button>
      </div>
      <div className="flex justify-around px-2">
        {weekDays.map(d => {
          const isSelected = d.dateStr === selectedDate;
          return (
            <div key={d.dateStr} onClick={() => onDateSelect(d.dateStr)} 
              className={`flex flex-col items-center justify-center w-10 h-14 rounded-2xl cursor-pointer transition-all duration-200 ${isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105' : 'text-gray-500 hover:bg-gray-50'}`}>
              <span className="text-[10px] font-medium opacity-80">{d.weekDay}</span>
              <span className="text-lg font-bold">{d.day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 4. Payer Management Modal Component
const PayerManagementModal = ({ payers, onSavePayers, onClose, onDeletePayer }) => {
    const [newPayer, setNewPayer] = useState('');
    const [editingPayer, setEditingPayer] = useState(null); // { originalName: string, newName: string }

    const handleAddPayer = () => {
        if (newPayer && !payers.includes(newPayer)) {
            onSavePayers([...payers, newPayer]);
            setNewPayer('');
        }
    };

    const handleStartEdit = (payer) => {
        setEditingPayer({ originalName: payer, newName: payer });
    };

    const handleSaveEdit = () => {
        if (!editingPayer || !editingPayer.newName || editingPayer.newName === editingPayer.originalName) {
            setEditingPayer(null);
            return;
        }

        const newPayerName = editingPayer.newName.trim();
        if (newPayerName && !payers.includes(newPayerName)) {
            const newPayersList = payers.map(p => 
                p === editingPayer.originalName ? newPayerName : p
            );
            onSavePayers(newPayersList);
            setEditingPayer(null);
        } else if (payers.includes(newPayerName)) {
             console.error('Payer name already exists.');
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center sm:justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:w-[350px] rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2"><Users size={24}/> 付款人名單管理</h3>
                    <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
                
                {/* Add New Payer */}
                <div className="flex gap-2 mb-6">
                    <input 
                        type="text" 
                        value={newPayer} 
                        onChange={e => setNewPayer(e.target.value)} 
                        placeholder="新增付款人名稱" 
                        className="flex-1 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500/20 text-gray-900"
                        onKeyPress={(e) => { if (e.key === 'Enter') { handleAddPayer(); e.preventDefault(); } }}
                    />
                    <button onClick={handleAddPayer} disabled={!newPayer} className="p-3 bg-blue-600 text-white rounded-xl disabled:opacity-50 transition-colors">
                        <PlusCircle size={24} />
                    </button>
                </div>

                {/* Payer List */}
                <ul className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {payers.map(p => (
                        <li key={p} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                            {editingPayer?.originalName === p ? (
                                <div className="flex-1 flex items-center gap-2">
                                    <input 
                                        type="text" 
                                        value={editingPayer.newName} 
                                        onChange={e => setEditingPayer({ ...editingPayer, newName: e.target.value })} 
                                        className="flex-1 bg-white p-2 border border-blue-300 rounded-lg text-sm font-medium"
                                        autoFocus
                                        onKeyPress={(e) => { if (e.key === 'Enter') { handleSaveEdit(); e.preventDefault(); } }}
                                    />
                                    <button onClick={handleSaveEdit} className="text-green-600 hover:text-green-700 p-1"><Check size={20} /></button>
                                </div>
                            ) : (
                                <>
                                    <span className="font-medium text-gray-800">{p}</span>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleStartEdit(p)} className="p-1 text-blue-500 hover:text-blue-700"><Edit size={16} /></button>
                                        <button onClick={() => onDeletePayer(p)} className="p-1 text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                    </div>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};


// 5. Expense Form
const ExpenseForm = ({ initialExpense, onSave, onDelete, payerList, savePayers }) => {
  const [amount, setAmount] = useState(initialExpense?.inputAmount?.toString() || '');
  const [currency, setCurrency] = useState(initialExpense?.inputCurrency || 'TWD');
  const [desc, setDesc] = useState(initialExpense?.description || '');
  const [cat, setCat] = useState(initialExpense?.category || '餐飲');
  const [date, setDate] = useState(initialExpense?.date || new Date().toISOString().slice(0, 10));
  const [payer, setPayer] = useState(initialExpense?.payer || payerList[0]);
  const [showPayerManager, setShowPayerManager] = useState(false); // New State for Payer Management

  const twdAmount = useMemo(() => {
    const val = parseFloat(amount);
    if(isNaN(val)) return 0;
    return Math.round(val * EXCHANGE_RATES[currency] * 100) / 100;
  }, [amount, currency]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || !desc) return;
    onSave({
      id: initialExpense?.id || Date.now(),
      date, category: cat, description: desc,
      amount: twdAmount, currency: 'TWD',
      inputAmount: parseFloat(amount), inputCurrency: currency,
      payer
    }, !!initialExpense);
  };

  const handleDeletePayer = (target) => {
    // Check if the payer is in use (simplified check)
    // Note: Use a custom modal in a real application instead of window.confirm
    if (window.confirm(`確定刪除付款人 "${target}"? 此操作不會影響已記錄的支出。`)) {
      const newList = payerList.filter(p => p !== target);
      savePayers(newList);
      if (payer === target) setPayer(newList[0] || ''); // Reset selection if deleted
    }
  };

  // Ensure selected payer is still valid
  useEffect(() => {
    if (!payerList.includes(payer)) {
        setPayer(payerList[0] || '');
    }
  }, [payerList, payer]);


  return (
    <form onSubmit={handleSubmit} className="space-y-6 pt-2">
      {/* Amount Display */}
      <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
        <div className="flex items-baseline gap-2">
          <input 
            type="number" 
            value={amount} 
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            className="text-4xl font-extrabold text-center bg-transparent focus:outline-none w-40 text-gray-900"
            autoFocus
          />
          <select 
            value={currency} 
            onChange={e => setCurrency(e.target.value)}
            className="text-xl font-bold bg-transparent border-none focus:ring-0 text-blue-600 cursor-pointer"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {currency !== 'TWD' && <p className="text-sm text-gray-400 mt-1">≈ {twdAmount.toLocaleString()} TWD</p>}
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 ml-1">項目描述</label>
          <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="例如: 午餐" className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500/20 text-gray-900 font-medium" />
        </div>

        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-semibold text-gray-500 ml-1">日期</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500/20 text-gray-900 font-medium" />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-semibold text-gray-500 ml-1">類別</label>
            <select value={cat} onChange={e => setCat(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500/20 text-gray-900 font-medium appearance-none">
              {['餐飲', '交通', '住宿', '購物', '其他'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center ml-1">
              <label className="text-xs font-semibold text-gray-500">付款人</label>
              <button 
                  type="button" 
                  onClick={() => setShowPayerManager(true)} 
                  className="text-xs font-medium text-blue-600 flex items-center gap-1 hover:text-blue-700"
              >
                  管理名單 <Users size={12}/>
              </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {payerList.map(p => (
              <button key={p} type="button" onClick={() => setPayer(p)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${payer === p ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 active:scale-95 transition-all">
        {initialExpense ? '儲存變更' : '新增支出'}
      </button>

      {/* Payer Management Modal (New Component) */}
      {showPayerManager && (
          <PayerManagementModal 
              payers={payerList} 
              onSavePayers={savePayers} 
              onClose={() => setShowPayerManager(false)} 
              onDeletePayer={handleDeletePayer}
          />
      )}
    </form>
  );
};

// 6. Activity Form Component (Updated for Geocoding)
const ActivityForm = ({ initialActivity, onSave, selectedDate }) => {
  const [date, setDate] = useState(initialActivity?.date || selectedDate);
  const [time, setTime] = useState(initialActivity?.time || '10:00');
  const [icon, setIcon] = useState(initialActivity?.icon || 'MapPin');
  const [desc, setDesc] = useState(initialActivity?.description || '');
  const [location, setLocation] = useState(initialActivity?.location || '');
  
  // New States for Geocoding
  const [lat, setLat] = useState(initialActivity?.lat || null);
  const [lng, setLng] = useState(initialActivity?.lng || null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState(null); // 'found', 'not_found', 'searching', 'none'

  useEffect(() => {
    if (initialActivity) {
      if (initialActivity.lat && initialActivity.lng) {
        setGeocodeStatus('found');
      } else if (initialActivity.location) {
        setGeocodeStatus('none'); // Has location string but no coords
      }
    }
  }, [initialActivity]);


  const ICON_CHOICES = ['MapPin', 'Utensils', 'ShoppingBag', 'Plane', 'Car', 'Home', 'Sun'];

  const handleGeocode = async () => {
    if (!location.trim()) return;

    setIsGeocoding(true);
    setGeocodeStatus('searching');
    setLat(null); setLng(null); // Clear previous coords

    // Implementing exponential backoff for simulated API call
    let result = null;
    const maxRetries = 3;
    let delay = 200; // Start delay in milliseconds

    for (let i = 0; i < maxRetries; i++) {
        try {
            result = await geocodeLocation(location.trim());
            if (result) break; // Success
        } catch (error) {
            console.error(`Geocoding attempt ${i + 1} failed. Retrying...`, error);
        }

        if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }

    setIsGeocoding(false);
    if (result) {
      setLat(result.lat);
      setLng(result.lng);
      setGeocodeStatus('found');
    } else {
      setGeocodeStatus('not_found');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!desc || !date || !time) return;

    onSave({
      id: initialActivity?.id || `a${Date.now()}`,
      date,
      time,
      icon,
      description: desc,
      location,
      lat: lat, // Pass found coordinates
      lng: lng, // Pass found coordinates
      originalDate: initialActivity?.date, 
    }, !!initialActivity);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pt-2">
      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-semibold text-gray-500 ml-1">日期</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 font-medium" />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs font-semibold text-gray-500 ml-1">時間</label>
          <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 font-medium" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-gray-500 ml-1">活動描述</label>
        <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="例如: 午餐 - 知名拉麵店" className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 font-medium" autoFocus={!initialActivity} />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 ml-1">地點名稱 (地圖連結)</label>
        <div className="flex gap-2">
          <input 
            type="text" 
            value={location} 
            onChange={e => { setLocation(e.target.value); setGeocodeStatus(null); setLat(null); setLng(null); }}
            placeholder="例如: 東京車站" 
            className="flex-1 p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 font-medium" 
          />
          <button 
            type="button" 
            onClick={handleGeocode}
            disabled={!location.trim() || isGeocoding}
            className={`w-14 h-14 flex items-center justify-center rounded-xl transition-colors ${!location.trim() || isGeocoding ? 'bg-gray-300 text-gray-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
          >
            {isGeocoding ? (
                <Loader2 className="animate-spin h-5 w-5" />
            ) : (
                <Search size={24} />
            )}
          </button>
        </div>
        
        {/* Geocoding Status Feedback */}
        <div className="h-4 mt-1 px-1">
          {geocodeStatus === 'found' && (
            <p className="text-xs text-green-600 flex items-center gap-1 font-medium">
              <Globe size={12}/> 已連結地圖: {lat.toFixed(4)}, {lng.toFixed(4)}
            </p>
          )}
          {geocodeStatus === 'not_found' && (
            <p className="text-xs text-red-500 flex items-center gap-1 font-medium">
              <X size={12}/> 模擬地圖未找到該地點。
            </p>
          )}
          {geocodeStatus === 'searching' && (
             <p className="text-xs text-gray-500 flex items-center gap-1 font-medium">
              <Search size={12}/> 搜尋中... (模擬)
             </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 ml-1">圖示</label>
        <div className="flex flex-wrap gap-2">
          {ICON_CHOICES.map(iName => {
            const Icon = ICON_MAP[iName];
            return (
              <button 
                key={iName} 
                type="button" 
                onClick={() => setIcon(iName)} 
                className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all ${icon === iName ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                <Icon size={24} />
              </button>
            );
          })}
        </div>
      </div>

      <button type="submit" className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-all">
        {initialActivity ? '儲存變更' : '新增行程活動'}
      </button>
    </form>
  );
};

// --- Main App Logic ---
const App = () => {
  const [activeTab, setActiveTab] = useState('itinerary');
  const [expenses, setExpenses] = useState(initialExpenses);
  const [itinerary, setItinerary] = useState(initialItinerary);
  const [payers, setPayers] = useState(() => {
    // 嘗試從 localStorage 載入付款人名單
    try { return JSON.parse(localStorage.getItem('payers')) || DEFAULT_PAYERS; } catch { return DEFAULT_PAYERS; }
  });
  
  // Date States
  const [selectedItineraryDate, setSelectedItineraryDate] = useState(initialItinerary[0]?.date || formatDate(new Date()));
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [filterPayer, setFilterPayer] = useState('All');
  
  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'expense', 'activity'
  const [editItem, setEditItem] = useState(null);
  const [popoverOpen, setPopoverOpen] = useState(false); // DatePicker Popover

  // Firebase State (Included for environment completeness, but no database ops implemented here)
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Initialize Firebase and Auth
  useEffect(() => {
    let app, authInstance, dbInstance;
    try {
        // 從 Canvas 環境變數中獲取配置和 token
        const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        if (Object.keys(firebaseConfig).length === 0) {
            // 如果配置為空，則跳過初始化
            setIsAuthReady(true); 
            return;
        }

        // 初始化 Firebase 服務
        app = initializeApp(firebaseConfig);
        authInstance = getAuth(app);
        dbInstance = getFirestore(app);

        setAuth(authInstance);
        setDb(dbInstance);

        // 監聽認證狀態變化
        const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else if (initialAuthToken) {
                try {
                    // 使用 custom token 登入
                    await signInWithCustomToken(authInstance, initialAuthToken);
                } catch (e) {
                    console.error("Custom token sign in failed, signing in anonymously.", e);
                    // custom token 失敗則匿名登入
                    await signInAnonymously(authInstance);
                }
            } else {
                // 否則匿名登入
                await signInAnonymously(authInstance);
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    } catch (error) {
        console.error("Firebase Initialization Error:", error);
        setIsAuthReady(true);
    }
  }, []); // Run only once on mount


  const savePayers = (newList) => {
    setPayers(newList);
    localStorage.setItem('payers', JSON.stringify(newList));
    // Ensure the filter is still valid
    if (filterPayer !== 'All' && !newList.includes(filterPayer)) {
        setFilterPayer('All');
    }
  };

  // --- Expense Handlers ---
  const handleExpenseSave = (expense, isEdit) => {
    setExpenses(prev => isEdit ? prev.map(e => e.id === expense.id ? expense : e) : [...prev, expense].sort((a,b)=> new Date(b.date)-new Date(a.date)));
    setModalOpen(false);
  };
  
  const handleExpenseDelete = (id) => {
    // Note: Use a custom modal in a real application instead of window.confirm
    if(window.confirm('確定刪除這筆支出嗎?')) { 
      setExpenses(prev => prev.filter(e => e.id !== id));
      setModalOpen(false);
    }
  };

  // --- Activity Handlers ---
  const handleActivitySave = (activity, isEdit) => {
    setItinerary(prev => {
      // 1. Check if date was changed in edit mode
      if (isEdit && activity.originalDate && activity.originalDate !== activity.date) {
        let newState = prev.map(day => {
          // Remove from original date
          if (day.date === activity.originalDate) {
              return { ...day, activities: day.activities.filter(a => a.id !== activity.id) };
          }
          return day;
        }).filter(day => day.activities.length > 0); // Remove empty days

        // Add to new date
        let newDayIndex = newState.findIndex(day => day.date === activity.date);
        const { originalDate, ...activityWithoutOriginalDate } = activity;

        if (newDayIndex === -1) {
             newState = [...newState, { date: activity.date, activities: [activityWithoutOriginalDate] }].sort((a, b) => a.date.localeCompare(b.date));
        } else {
             // For the new day, either update existing or add new activity
             newState[newDayIndex].activities = newState[newDayIndex].activities.map(a => 
                  a.id === activity.id ? activityWithoutOriginalDate : a
                );
             // Ensure it's added if not found in the target day (could happen if moving to an existing day)
             if (!newState[newDayIndex].activities.some(a => a.id === activity.id)) {
                 newState[newDayIndex].activities = [...newState[newDayIndex].activities, activityWithoutOriginalDate];
             }
             newState[newDayIndex].activities.sort((a,b)=>a.time.localeCompare(b.time)); // Sort by time
        }
        return newState;

      } else {
        // Simple Add or Edit (date not changed)
        let dayIndex = prev.findIndex(day => day.date === activity.date);
        const { originalDate, ...activityWithoutOriginalDate } = activity; // Exclude originalDate for persistence

        if (dayIndex === -1) {
          // Day doesn't exist, create new day entry
          const newDay = { date: activity.date, activities: [activityWithoutOriginalDate] };
          return [...prev, newDay].sort((a, b) => a.date.localeCompare(b.date));
        } else {
          // Day exists, update activities for that day
          const updatedActivities = isEdit 
            ? prev[dayIndex].activities.map(a => a.id === activity.id ? activityWithoutOriginalDate : a)
            : [...prev[dayIndex].activities, activityWithoutOriginalDate];
          
          updatedActivities.sort((a,b)=>a.time.localeCompare(b.time)); // Sort by time

          const updatedDay = { ...prev[dayIndex], activities: updatedActivities };
          return prev.map((day, index) => index === dayIndex ? updatedDay : day);
        }
      }
    });
    setModalOpen(false);
    // Ensure the calendar view switches to the newly added activity date
    setSelectedItineraryDate(activity.date); 
    // Switch to Map tab if coordinates were set
    if (activity.lat && activity.lng) {
      setActiveTab('map');
    }
  };
  
  const handleActivityDelete = (id, date) => {
      if(window.confirm('確定刪除這筆行程活動嗎?')) { 
        setItinerary(prev => prev.map(day => {
          if (day.date === date) {
             return { ...day, activities: day.activities.filter(a => a.id !== id) };
          }
          return day;
        }).filter(day => day.activities.length > 0)); // Remove empty days
        setModalOpen(false);
      }
  };


  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const matchPayer = filterPayer === 'All' || e.payer === filterPayer;
      const matchDate = (!filterStart || e.date >= filterStart) && (!filterEnd || e.date <= filterEnd);
      return matchPayer && matchDate;
    });
  }, [expenses, filterPayer, filterStart, filterEnd]);

  const totalExpense = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // --- Render Sections ---
  const renderExpenses = () => (
    <div className="p-4 pb-32 space-y-6">
      {/* Header Card */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-200">
        <p className="text-blue-100 font-medium mb-1">總支出 (TWD)</p>
        <h1 className="text-4xl font-extrabold tracking-tight">NT$ {totalExpense.toLocaleString()}</h1>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Date Filter Bar */}
        <div className="relative">
          <button 
            onClick={() => setPopoverOpen(!popoverOpen)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border ${filterStart ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600'}`}
          >
            <div className="flex items-center gap-2">
              <Calendar size={18} />
              <span className="text-sm font-medium">
                {filterStart ? `${filterStart} ~ ${filterEnd || '...'}` : '選擇日期區間'}
              </span>
            </div>
            {filterStart && <X size={16} onClick={(e) => { e.stopPropagation(); setFilterStart(''); setFilterEnd(''); }} />}
          </button>
          
          {popoverOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50 animate-in fade-in zoom-in-95 duration-200">
              <RangeCalendar 
                startDate={filterStart} endDate={filterEnd} 
                onSelectDate={(d) => {
                  if(!filterStart || (filterStart && filterEnd)) { setFilterStart(d); setFilterEnd(''); }
                  else { if(d<filterStart) { setFilterStart(d); setFilterEnd(''); } else { setFilterEnd(d); setPopoverOpen(false); } }
                }} 
              />
            </div>
          )}
        </div>

        {/* Payer Filter Chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button onClick={() => setFilterPayer('All')} className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-colors ${filterPayer === 'All' ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            所有
          </button>
          {payers.map(p => (
            <button key={p} onClick={() => setFilterPayer(p)} className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-colors ${filterPayer === p ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-1">
        {filteredExpenses.map(e => (
          <ExpenseItem key={e.id} expense={e} onEdit={() => { setEditItem(e); setModalType('expense'); setModalOpen(true); }} />
        ))}
        {filteredExpenses.length === 0 && <div className="text-center py-10 text-gray-400">沒有支出記錄</div>}
      </div>
    </div>
  );

  const renderItinerary = () => {
    // 找出目前選定日期的行程，如果沒有則回傳 undefined
    const currentDayPlan = itinerary.find(i => i.date === selectedItineraryDate);
    const activities = currentDayPlan ? currentDayPlan.activities : [];

    const handleEditActivity = (act) => {
      // Store original date for deletion/moving logic
      setEditItem({ ...act, originalDate: selectedItineraryDate }); 
      setModalType('activity');
      setModalOpen(true);
    };

    return (
      <div className="pb-32">
        <div className="bg-white sticky top-0 z-30 shadow-sm">
           <div className="p-4 pb-2">
             <h2 className="text-2xl font-bold text-gray-900">{TRAVEL_INFO.destination}</h2>
             <p className="text-sm text-gray-500">{TRAVEL_INFO.dateRange}</p>
           </div>
           <WeeklyCalendar selectedDate={selectedItineraryDate} onDateSelect={setSelectedItineraryDate} />
        </div>
        
        <div className="p-4 space-y-4 min-h-[50vh]">
           <h3 className="font-bold text-gray-800 text-lg sticky top-[140px] bg-gray-50/90 backdrop-blur py-2 z-20">
             {selectedItineraryDate}
           </h3>
           <div className="relative pl-6 border-l-2 border-dashed border-gray-200 space-y-6">
             {activities.length > 0 ? activities.sort((a,b)=>a.time.localeCompare(b.time)).map(act => {
               const Icon = getActivityIcon(act.icon);
               // Check if location has coordinates
               const hasCoords = act.lat && act.lng;
               return (
                 <div 
                    key={act.id} 
                    className="relative bg-white p-4 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleEditActivity(act)} // 新增點擊編輯功能
                 >
                    <div className="absolute -left-[31px] top-4 w-4 h-4 bg-indigo-500 rounded-full border-4 border-gray-50"></div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                         <Icon size={20} />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-indigo-600 block mb-0.5">{act.time}</span>
                        <h4 className="font-bold text-gray-800">{act.description}</h4>
                        {act.location && (
                           <p className={`text-xs mt-1 flex items-center gap-1 ${hasCoords ? 'text-green-600' : 'text-gray-400'}`}>
                             {hasCoords ? <MapPin size={12}/> : <Globe size={12}/>}{act.location} 
                             {hasCoords && <span className="text-[10px] ml-1 opacity-70">(地圖)</span>}
                           </p>
                        )}
                      </div>
                    </div>
                 </div>
               )
             }) : (
               <div className="py-10 text-center text-gray-400 italic">本日無行程，點擊右下角按鈕新增</div>
             )}
           </div>
        </div>
      </div>
    );
  };

  // 獨立的 Form 內容區塊
  const ModalFormContent = ({ modalType, editItem }) => {
    // 決定刪除操作要傳遞的參數
    const handleDelete = () => {
        // Note: Use a custom modal in a real application instead of window.confirm
        if(modalType === 'expense') handleExpenseDelete(editItem.id);
        if(modalType === 'activity') handleActivityDelete(editItem.id, editItem.originalDate || editItem.date);
    };

    return (
        <>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">
                    {editItem ? '編輯' : '新增'}
                    {modalType === 'expense' ? '支出' : '行程活動'}
                </h2>
                <div className="flex gap-2">
                    {editItem && (
                        <button onClick={handleDelete} className="p-2 bg-red-50 text-red-500 rounded-full hover:bg-red-100"><Trash2 size={18}/></button>
                    )}
                    <button onClick={() => setModalOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={18}/></button>
                </div>
            </div>
            {modalType === 'expense' && (
                <ExpenseForm 
                    initialExpense={editItem} 
                    onSave={handleExpenseSave} 
                    payerList={payers} 
                    savePayers={savePayers} 
                    onDelete={handleExpenseDelete}
                />
            )}
            {modalType === 'activity' && (
                <ActivityForm
                    initialActivity={editItem}
                    onSave={handleActivitySave}
                    selectedDate={selectedItineraryDate}
                />
            )}
        </>
    );
  };


  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex justify-center">
      <div className="w-full max-w-md bg-gray-50 min-h-screen relative shadow-2xl overflow-hidden flex flex-col">
        
        {/* Content Area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {activeTab === 'map' && <MapView itinerary={itinerary} />}
          {activeTab === 'expenses' && renderExpenses()}
          {activeTab === 'itinerary' && renderItinerary()}
        </div>

        {/* FAB (Floating Action Button) */}
        {activeTab !== 'map' && (
          <button 
            onClick={() => { 
                setEditItem(null); 
                setModalType(activeTab === 'expenses' ? 'expense' : 'activity'); 
                setModalOpen(true); 
            }}
            className="absolute bottom-24 right-5 w-14 h-14 bg-gray-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40"
          >
            <PlusCircle size={28} />
          </button>
        )}

        {/* Bottom Navigation */}
        <nav className="bg-white border-t border-gray-100 h-20 px-6 flex justify-between items-center absolute bottom-0 w-full z-50 pb-2">
          <NavBtn icon={Euro} label="記帳" active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} />
          <NavBtn icon={Calendar} label="行程" active={activeTab === 'itinerary'} onClick={() => setActiveTab('itinerary')} />
          <NavBtn icon={Navigation} label="地圖" active={activeTab === 'map'} onClick={() => setActiveTab('map')} />
        </nav>

        {/* --- 統一 Bottom Sheet Modal 結構 ---
          將原本分開的 Expense Modal 和 Activity Bottom Sheet 統一，
          確保兩者都是從底部滑入，並帶有 Backdrop。
        */}
        {modalOpen && (
            <div className="fixed inset-0 z-[60] flex items-end justify-center">
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
                {/* Sheet Container: 使用 sm:max-w-md 限制桌面寬度，使用 rounded-t-3xl 確保底部滑入樣式 */}
                <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-300 max-h-[85vh] overflow-y-auto z-10">
                    <ModalFormContent modalType={modalType} editItem={editItem} />
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

const NavBtn = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-colors duration-200 ${active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
    <Icon size={24} strokeWidth={active ? 2.5 : 2} />
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

export default App;