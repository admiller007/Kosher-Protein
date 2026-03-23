import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Loader2, Info, ExternalLink, ShieldCheck, Package, Building2, ChevronLeft, ChevronRight, BarChart3, Plus, Trash2, TrendingUp, DollarSign, Zap, Filter, PieChart as PieChartIcon, ShoppingCart, MapPin, Globe, Calendar, LayoutGrid, Map as MapIcon, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import * as d3 from 'd3';
import { analyzeProduct, type ProductAnalysis } from './services/analysisService';
import { MapView } from './components/MapView';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Product {
  agencyUniqueId: string;
  productName: string;
  company: string;
  brandName: string;
  dpm: string;
  symbol: string;
  category: string;
  certifiedSince: string;
  location?: string;
  website?: string;
}

interface ApiResponse {
  results: Product[];
  total: number;
}

const COLORS = ['#1a4d2e', '#ff9f29', '#4b5563', '#10b981', '#3b82f6', '#8b5cf6', '#f43f5e'];

const LocationChart = ({ data }: { data: { name: string, value: number }[] }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 400;
    const height = 250;
    const margin = { top: 20, right: 30, bottom: 40, left: 120 };

    const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) || 0])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleBand()
      .domain(data.map(d => d.name))
      .range([margin.top, height - margin.bottom])
      .padding(0.2);

    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5))
      .attr("color", "#94a3b8");

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y))
      .attr("color", "#94a3b8")
      .selectAll("text")
      .attr("font-size", "10px")
      .attr("font-weight", "600");

    svg.selectAll("rect")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", margin.left)
      .attr("y", d => y(d.name)!)
      .attr("width", d => x(d.value) - margin.left)
      .attr("height", y.bandwidth())
      .attr("fill", "#1a4d2e")
      .attr("rx", 4)
      .attr("opacity", 0.8)
      .on("mouseover", function() { d3.select(this).attr("opacity", 1); })
      .on("mouseout", function() { d3.select(this).attr("opacity", 0.8); });

  }, [data]);

  return <svg ref={svgRef} width="100%" height="250" viewBox="0 0 400 250" preserveAspectRatio="xMinYMin meet" />;
};

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('protein');
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState('protein');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedDpm, setSelectedDpm] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'default' | 'newest'>('default');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const limit = 50;

  // Comparison State
  const [comparisonList, setComparisonList] = useState<Product[]>([]);
  const [analysisResults, setAnalysisResults] = useState<Record<string, ProductAnalysis>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(false);
  const [globalStats, setGlobalStats] = useState<{ name: string; value: number }[]>([]);
  const [locationStats, setLocationStats] = useState<{ name: string; value: number }[]>([]);
  const [isFetchingStats, setIsFetchingStats] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const fetchProducts = async (query: string, page: number = 1, category: string = 'All', dpm: string = 'All') => {
    setLoading(true);
    setError(null);
    try {
      // Build a comprehensive search query including category and DPM status
      const filterParts = [query];
      if (category !== 'All') filterParts.push(category);
      if (dpm !== 'All') filterParts.push(dpm);
      
      const fullQuery = filterParts.join(' ');
      
      const response = await fetch(`/api/products?query=${encodeURIComponent(fullQuery)}&page=${page}&limit=${limit}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || 'Failed to fetch products');
      }
      const data: ApiResponse = await response.json();
      
      let results = data.results || [];

      // Strict client-side filtering to ensure category and DPM match exactly
      if (category !== 'All') {
        results = results.filter(p => p.category === category);
      }
      if (dpm !== 'All') {
        results = results.filter(p => p.dpm === dpm);
      }

      // Relevance filtering for keyword search
      // If a query is provided, ensure it's actually present in the product name, brand, or category
      // This prevents irrelevant results like 'Apple Coffee Cake' showing up for 'protein'
      if (query && query.trim().length > 0) {
        const searchTerms = query.toLowerCase().split(' ').filter(t => t.length > 0);
        results = results.filter(p => {
          const searchableText = `${p.productName} ${p.brandName} ${p.company} ${p.category}`.toLowerCase();
          // Check if at least one search term is present in the product info
          return searchTerms.some(term => searchableText.includes(term));
        });
      }
      
      // Client-side sorting for "Newest Certified"
      if (sortBy === 'newest') {
        results = [...results].sort((a, b) => {
          const dateA = new Date(a.certifiedSince).getTime();
          const dateB = new Date(b.certifiedSince).getTime();
          return dateB - dateA;
        });
      }
      
      setProducts(results);
      // Update total results based on filtered count if we're on page 1 and have fewer results than limit
      // Otherwise keep the API total as an estimate
      if (page === 1 && results.length < limit && data.total > results.length) {
        setTotalResults(results.length);
      } else {
        setTotalResults(data.total || 0);
      }
      setCurrentPage(page);
    } catch (err: any) {
      setError(err.message || 'Could not load products. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      const filterParts = [searchQuery];
      if (selectedCategory !== 'All') filterParts.push(selectedCategory);
      if (selectedDpm !== 'All') filterParts.push(selectedDpm);
      const fullQuery = filterParts.join(' ');

      // Fetch a larger batch for export (up to 1000 results)
      const response = await fetch(`/api/products?query=${encodeURIComponent(fullQuery)}&page=1&limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch data for export');
      
      const data: ApiResponse = await response.json();
      let results = data.results || [];

      // Apply the same strict filtering as in fetchProducts
      if (selectedCategory !== 'All') {
        results = results.filter(p => p.category === selectedCategory);
      }
      if (selectedDpm !== 'All') {
        results = results.filter(p => p.dpm === selectedDpm);
      }

      if (results.length === 0) {
        alert('No data found to export');
        return;
      }

      // Convert to CSV
      const headers = ['Product Name', 'Company', 'Brand', 'Category', 'Status', 'Symbol', 'Certified Since', 'Location', 'Website'];
      const csvRows = [
        headers.join(','),
        ...results.map(p => [
          `"${(p.productName || '').replace(/"/g, '""')}"`,
          `"${(p.company || '').replace(/"/g, '""')}"`,
          `"${(p.brandName || '').replace(/"/g, '""')}"`,
          `"${(p.category || '').replace(/"/g, '""')}"`,
          `"${(p.dpm || '').replace(/"/g, '""')}"`,
          `"${(p.symbol || '').replace(/"/g, '""')}"`,
          `"${p.certifiedSince || ''}"`,
          `"${(p.location || '').replace(/"/g, '""')}"`,
          `"${(p.website || '').replace(/"/g, '""')}"`
        ].join(','))
      ];

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `kosher_products_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export CSV. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const fetchGlobalStats = async (query: string) => {
    setIsFetchingStats(true);
    try {
      // Fetch a much larger sample (up to 500 products) for more accurate global category breakdown
      const response = await fetch(`/api/products?query=${encodeURIComponent(query)}&page=1&limit=500`);
      if (!response.ok) return;
      const data: ApiResponse = await response.json();
      
      const stats: Record<string, number> = {};
      const locs: Record<string, number> = {};
      
      (data.results || []).forEach(p => {
        stats[p.category] = (stats[p.category] || 0) + 1;
        if (p.location) {
          locs[p.location] = (locs[p.location] || 0) + 1;
        }
      });
      
      const formattedStats = Object.entries(stats)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      const formattedLocs = Object.entries(locs)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      
      setGlobalStats(formattedStats);
      setLocationStats(formattedLocs);
    } catch (err) {
      console.error("Failed to fetch global stats:", err);
    } finally {
      setIsFetchingStats(false);
    }
  };

  // Fetch products when query, filters, or page change
  useEffect(() => {
    fetchProducts(lastSubmittedQuery, currentPage, selectedCategory, selectedDpm);
  }, [lastSubmittedQuery, currentPage, selectedCategory, selectedDpm, sortBy]);

  // Fetch global stats only when query changes
  useEffect(() => {
    fetchGlobalStats(lastSubmittedQuery);
  }, [lastSubmittedQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLastSubmittedQuery(searchQuery);
    setCurrentPage(1);
    setSelectedCategory('All');
    setSelectedDpm('All');
    setSortBy('default');
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1);
    // Smooth scroll to results
    const resultsElement = document.getElementById('results-grid');
    if (resultsElement) {
      resultsElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleDpmSelect = (dpm: string) => {
    setSelectedDpm(dpm);
    setCurrentPage(1);
  };

  const handleSortChange = (sort: 'default' | 'newest') => {
    setSortBy(sort);
    setCurrentPage(1);
  };

  const categories = useMemo(() => {
    if (globalStats.length > 0) {
      return ['All', ...globalStats.map(s => s.name)].sort();
    }
    const cats = new Set(products.map(p => p.category));
    return ['All', ...Array.from(cats)].sort();
  }, [products, globalStats]);

  const totalPages = Math.ceil(totalResults / limit);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const addToComparison = (product: Product) => {
    if (!comparisonList.find(p => p.agencyUniqueId === product.agencyUniqueId)) {
      setComparisonList([...comparisonList, product]);
    }
  };

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    const newResults: Record<string, ProductAnalysis> = { ...analysisResults };
    
    for (const product of comparisonList) {
      if (!newResults[product.agencyUniqueId]) {
        const result = await analyzeProduct(product.productName, product.brandName || product.company);
        if (result) {
          newResults[product.agencyUniqueId] = result;
        }
      }
    }
    
    setAnalysisResults(newResults);
    setIsAnalyzing(false);
    setShowAnalysis(true);
  };

  const chartData = useMemo(() => {
    return comparisonList
      .filter(p => analysisResults[p.agencyUniqueId])
      .map(p => ({
        name: p.productName.substring(0, 20) + '...',
        fullName: p.productName,
        bangForBuck: analysisResults[p.agencyUniqueId].bangForBuck,
        protein: analysisResults[p.agencyUniqueId].proteinGrams,
        price: analysisResults[p.agencyUniqueId].priceEstimate,
      }))
      .sort((a, b) => a.bangForBuck - b.bangForBuck);
  }, [comparisonList, analysisResults]);

  const getAmazonUrl = (product: Product) => {
    const query = `${product.brandName || product.company} ${product.productName}`;
    return `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
  };

  return (
    <div className="min-h-screen pb-20 bg-brand-secondary/30">
      {/* Hero Section */}
      <header className="relative h-[40vh] flex items-center justify-center overflow-hidden bg-brand-primary text-brand-secondary">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-brand-accent via-transparent to-transparent" />
        </div>
        
        <div className="relative z-10 text-center px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-7xl font-serif italic mb-4">Kosher Protein</h1>
            <p className="text-lg md:text-xl font-light tracking-wide opacity-90 max-w-2xl mx-auto">
              Discover OU Kosher certified protein products from trusted brands worldwide.
            </p>
          </motion.div>
        </div>
      </header>

      {/* Search Bar & Filters */}
      <div className="max-w-7xl mx-auto px-4 -mt-8 relative z-20">
        <div className="flex flex-col gap-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for protein, bars, shakes..."
                className="w-full pl-12 pr-4 py-4 rounded-2xl glass shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-accent transition-all text-lg"
              />
            </div>
            <button
              type="submit"
              className="bg-brand-primary text-white px-8 py-4 rounded-2xl font-medium hover:bg-opacity-90 transition-colors shadow-xl"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 bg-white/50 backdrop-blur-md px-4 py-2 rounded-xl border border-stone-200">
              <Filter className="w-4 h-4 text-stone-500" />
              <span className="text-sm font-bold text-stone-700">Category:</span>
              <select 
                value={selectedCategory}
                onChange={(e) => handleCategorySelect(e.target.value)}
                className="bg-transparent text-sm focus:outline-none cursor-pointer font-medium"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white/50 backdrop-blur-md px-4 py-2 rounded-xl border border-stone-200">
              <Filter className="w-4 h-4 text-stone-500" />
              <span className="text-sm font-bold text-stone-700">Status:</span>
              <select 
                value={selectedDpm}
                onChange={(e) => handleDpmSelect(e.target.value)}
                className="bg-transparent text-sm focus:outline-none cursor-pointer font-medium"
              >
                <option value="All">All Status</option>
                <option value="Pareve">Pareve</option>
                <option value="Dairy">Dairy</option>
                <option value="Dairy Equipment">Dairy Equipment</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white/50 backdrop-blur-md px-4 py-2 rounded-xl border border-stone-200">
              <TrendingUp className="w-4 h-4 text-stone-500" />
              <span className="text-sm font-bold text-stone-700">Sort:</span>
              <select 
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value as any)}
                className="bg-transparent text-sm focus:outline-none cursor-pointer font-medium"
              >
                <option value="default">Relevance</option>
                <option value="newest">Newly Certified</option>
              </select>
            </div>

            <div className="flex bg-white/50 backdrop-blur-md p-1 rounded-xl border border-stone-200">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm font-bold",
                  viewMode === 'grid' ? "bg-brand-primary text-white shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                <LayoutGrid className="w-4 h-4" />
                Grid
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm font-bold",
                  viewMode === 'map' ? "bg-brand-primary text-white shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                <MapIcon className="w-4 h-4" />
                Map
              </button>
            </div>

            <button
              onClick={() => setShowCategoryBreakdown(!showCategoryBreakdown)}
              className="flex items-center gap-2 bg-white/50 backdrop-blur-md px-4 py-2 rounded-xl border border-stone-200 hover:bg-white transition-colors text-sm font-bold text-stone-700"
            >
              <PieChartIcon className="w-4 h-4" />
              Category Breakdown
            </button>

            <button
              onClick={exportToCSV}
              disabled={isExporting}
              className="flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-xl shadow-sm hover:bg-brand-primary/90 transition-colors text-sm font-bold disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Export CSV
            </button>

            {selectedCategory !== 'All' && (
              <button
                onClick={() => handleCategorySelect('All')}
                className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl border border-red-100 hover:bg-red-100 transition-colors text-sm font-bold"
              >
                <Trash2 className="w-4 h-4" />
                Clear: {selectedCategory}
              </button>
            )}

            {totalResults > 0 && (
              <p className="text-stone-500 text-sm font-medium ml-auto">
                Showing {((currentPage - 1) * limit) + 1} - {Math.min(currentPage * limit, totalResults)} of {totalResults} results
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Category Breakdown Section */}
      <AnimatePresence>
        {showCategoryBreakdown && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="max-w-7xl mx-auto px-4 mt-8 overflow-hidden"
          >
            <div className="glass rounded-[2rem] p-8 border border-brand-primary/10">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-serif italic text-brand-primary">Global Category Breakdown</h3>
                {isFetchingStats && <Loader2 className="w-5 h-5 animate-spin text-brand-primary" />}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-1">
                  <h4 className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-4">Categories</h4>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={globalStats}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                          onClick={(data: any) => handleCategorySelect(String(data.name))}
                          className="cursor-pointer"
                        >
                          {globalStats.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={COLORS[index % COLORS.length]} 
                              stroke={selectedCategory === entry.name ? '#000' : 'none'}
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-1">
                  <h4 className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-4">Top Production Hubs (D3)</h4>
                  <div className="bg-white/30 rounded-2xl p-4 border border-stone-100">
                    <LocationChart data={locationStats} />
                  </div>
                </div>

                <div className="lg:col-span-1">
                  <h4 className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-4">Category List</h4>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {globalStats.map((stat, i) => (
                      <button 
                        key={stat.name} 
                        onClick={() => handleCategorySelect(stat.name)}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-2xl transition-all border",
                          selectedCategory === stat.name 
                            ? "bg-brand-primary text-white border-brand-primary shadow-md" 
                            : "bg-white/50 border-transparent hover:bg-white hover:border-stone-200"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedCategory === stat.name ? '#fff' : COLORS[i % COLORS.length] }} />
                          <span className="font-bold text-sm text-left">{stat.name}</span>
                        </div>
                        <span className={cn("text-xs font-medium", selectedCategory === stat.name ? "text-white/70" : "text-stone-500")}>
                          {stat.value}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comparison Drawer Trigger */}
      <AnimatePresence>
        {comparisonList.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
          >
            <div className="glass rounded-3xl p-4 shadow-2xl border-brand-primary/20 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-brand-primary text-white w-10 h-10 rounded-xl flex items-center justify-center font-bold">
                  {comparisonList.length}
                </div>
                <div>
                  <p className="font-bold text-stone-900">Comparison List</p>
                  <p className="text-xs text-stone-500">Analyze "Bang for Buck" metrics</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setComparisonList([])}
                  className="p-3 text-stone-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={runAnalysis}
                  disabled={isAnalyzing}
                  className="bg-brand-accent text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <BarChart3 className="w-5 h-5" />}
                  Analyze
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analysis Modal */}
      <AnimatePresence>
        {showAnalysis && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-brand-primary text-white">
                <div>
                  <h2 className="text-3xl font-serif italic">Bang for Buck Analysis</h2>
                  <p className="text-brand-secondary/70 text-sm">Comparing Price per Gram of Protein (Lower is Better)</p>
                </div>
                <button
                  onClick={() => setShowAnalysis(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Plus className="w-8 h-8 rotate-45" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-12">
                {/* Chart Section */}
                <div className="h-[400px] w-full bg-stone-50 rounded-3xl p-6 border border-stone-100">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 40, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={150} 
                        tick={{ fontSize: 12, fill: '#4b5563' }}
                      />
                      <Tooltip 
                        cursor={{ fill: 'rgba(26, 77, 46, 0.05)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white p-4 rounded-2xl shadow-xl border border-stone-100">
                                <p className="font-bold text-stone-900 mb-2">{data.fullName}</p>
                                <div className="space-y-1 text-sm">
                                  <p className="text-brand-primary flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4" />
                                    ${data.bangForBuck.toFixed(4)} / gram protein
                                  </p>
                                  <p className="text-stone-500 flex items-center gap-2">
                                    <Zap className="w-4 h-4" />
                                    {data.protein}g protein per serving
                                  </p>
                                  <p className="text-stone-500 flex items-center gap-2">
                                    <DollarSign className="w-4 h-4" />
                                    Est. Price: ${data.price}
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="bangForBuck" radius={[0, 10, 10, 0]} barSize={32}>
                        {chartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={index === 0 ? '#ff9f29' : '#1a4d2e'} 
                            fillOpacity={1 - (index * 0.1)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Detailed Table */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {comparisonList.map(product => {
                    const analysis = analysisResults[product.agencyUniqueId];
                    if (!analysis) return null;
                    return (
                      <div key={product.agencyUniqueId} className="p-6 rounded-3xl bg-stone-50 border border-stone-100 flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-stone-900 line-clamp-1">{product.productName}</h4>
                            {analysis.isUSDA && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold uppercase tracking-wider">
                                USDA Verified
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-stone-500 mb-2">{product.brandName || product.company}</p>
                          <div className="flex gap-4 text-sm">
                            <div className="text-brand-primary font-bold">
                              ${analysis.bangForBuck.toFixed(3)}/g
                            </div>
                            <div className="text-stone-600">
                              {analysis.proteinGrams}g Protein
                            </div>
                            <div className="text-stone-600">
                              ${analysis.priceEstimate}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <a href={getAmazonUrl(product)} target="_blank" rel="noopener noreferrer" className="p-3 bg-white rounded-xl text-orange-500 hover:bg-orange-50 transition-colors shadow-sm">
                            <ShoppingCart className="w-5 h-5" />
                          </a>
                          {analysis.sourceUrl && (
                            <a href={analysis.sourceUrl} target="_blank" rel="noopener noreferrer" className="p-3 bg-white rounded-xl text-stone-400 hover:text-brand-accent transition-colors shadow-sm">
                              <ExternalLink className="w-5 h-5" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main id="results-grid" className="max-w-7xl mx-auto px-4 mt-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-500">
            <Loader2 className="w-10 h-10 animate-spin mb-4" />
            <p className="font-medium">Fetching certified products...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20 bg-red-50 rounded-3xl border border-red-100">
            <p className="text-red-600 font-medium">{error}</p>
          </div>
        ) : viewMode === 'map' ? (
          <div className="mt-8">
            <MapView products={products} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {products.map((product, index) => (
                  <motion.div
                    key={product.agencyUniqueId || index}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3, delay: index * 0.02 }}
                    className="group glass rounded-3xl p-6 hover:shadow-2xl transition-all duration-300 flex flex-col justify-between border-brand-primary/5"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-2">
                          <div className="p-2 bg-brand-primary/10 rounded-xl text-brand-primary">
                            <Package className="w-5 h-5" />
                          </div>
                          {new Date(product.certifiedSince) >= new Date('2010-01-01') && (
                            <div className="px-2 py-1 bg-brand-accent/20 text-brand-accent rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center">
                              New
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold uppercase tracking-wider">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {product.symbol || 'OU'}
                        </div>
                      </div>

                      <h3 className="text-xl font-bold text-stone-900 mb-1 group-hover:text-brand-primary transition-colors line-clamp-2">
                        {product.productName}
                      </h3>
                      
                      <div className="flex flex-col gap-1.5 mb-4">
                        <div className="flex items-center gap-2 text-stone-500 text-sm">
                          <Building2 className="w-4 h-4" />
                          <span className="font-medium">{product.company}</span>
                        </div>
                        {product.location && (
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(product.location)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-stone-400 text-xs hover:text-brand-primary transition-colors"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{product.location}</span>
                          </a>
                        )}
                        {product.website && (
                          <a 
                            href={product.website.startsWith('http') ? product.website : `https://${product.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-stone-400 text-xs hover:text-brand-primary transition-colors"
                          >
                            <Globe className="w-3.5 h-3.5" />
                            <span>{product.website}</span>
                          </a>
                        )}
                      </div>

                      <div className="space-y-2">
                        {product.brandName && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Brand</span>
                            <span className="text-sm text-stone-700">{product.brandName}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Category</span>
                          <span className="text-sm text-stone-700">{product.category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Certified</span>
                          <span className="text-sm text-stone-700 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(product.certifiedSince).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-emerald-600 uppercase tracking-tighter">
                          {product.dpm}
                        </span>
                        {analysisResults[product.agencyUniqueId] && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-brand-accent/10 text-brand-accent rounded text-[10px] font-bold">
                            <TrendingUp className="w-3 h-3" />
                            ${analysisResults[product.agencyUniqueId].bangForBuck.toFixed(3)}/g
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => addToComparison(product)}
                          className={cn(
                            "p-2 rounded-xl transition-all",
                            comparisonList.find(p => p.agencyUniqueId === product.agencyUniqueId)
                              ? "bg-brand-primary text-white"
                              : "bg-brand-primary/5 text-brand-primary hover:bg-brand-primary hover:text-white"
                          )}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <a
                          href={getAmazonUrl(product)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 bg-orange-50 text-orange-500 rounded-xl hover:bg-orange-100 transition-colors"
                          title="Search on Amazon"
                        >
                          <ShoppingCart className="w-4 h-4" />
                        </a>
                        <a
                          href={`https://oukosher.org/product-search/?query=${encodeURIComponent(product.productName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-stone-400 hover:text-brand-accent transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl glass disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-primary hover:text-white transition-all flex items-center"
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span className="px-2 hidden sm:inline">Prev</span>
                </button>
                
                <div className="flex items-center gap-1">
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={cn(
                          "w-10 h-10 rounded-xl font-medium transition-all",
                          currentPage === pageNum 
                            ? "bg-brand-primary text-white shadow-lg" 
                            : "glass hover:bg-brand-primary/10"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-xl glass disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-primary hover:text-white transition-all flex items-center"
                >
                  <span className="px-2 hidden sm:inline">Next</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        )}

        {!loading && products.length === 0 && !error && (
          <div className="text-center py-20 text-stone-500">
            <Info className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-xl font-medium">No products found for "{searchQuery}"</p>
            <button 
              onClick={() => { setSearchQuery('protein'); fetchProducts('protein', 1); }}
              className="mt-4 text-brand-primary underline underline-offset-4"
            >
              Reset search
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-20 py-12 border-t border-stone-200 text-center text-stone-400 text-sm">
        <p>© {new Date().getFullYear()} Kosher Protein Finder</p>
        <p className="mt-2">Data provided by OU Kosher Product Search API. Analysis powered by Gemini AI.</p>
      </footer>
    </div>
  );
}
