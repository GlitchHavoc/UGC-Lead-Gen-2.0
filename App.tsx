
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Target, Mail, ExternalLink, Send, 
  Loader2, Sparkles, User, X, Zap, History as HistoryIcon, Clock, 
  LogOut, Check, Trash2, Cpu, Rocket, ShoppingCart, 
  Palette, Archive, RotateCcw, Diamond, Smile, Code2, 
  CheckCircle2, ChevronRight, Globe, Layout, Activity,
  Bookmark, Calendar, Copy, Filter, SlidersHorizontal, SearchX, Layers,
  Briefcase, Users
} from 'lucide-react';
import { ProductLead, BrandPreference } from './types';
import { discoverLeads, findContactInfo, generateOutreachEmail, searchSpecificBrand } from './services/geminiService';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

const DEFAULT_MEME_LIBRARY = [
  { url: "https://i.imgflip.com/agym35.jpg", source: "Skeleton Bench" },
  { url: "https://i.imgflip.com/agylgr.jpg", source: "Skeleton Underwater" },
  { url: "https://i.imgflip.com/agym8w.jpg", source: "Skeleton Field" }
];

const CATEGORIES = [
  { id: 'ai', label: 'AI Tools', icon: <Cpu className="w-5 h-5" />, query: 'AI Productivity Tools', mode: 'discovery' as const },
  { id: 'marketing', label: 'Marketing', icon: <Target className="w-5 h-5" />, query: 'Marketing platforms', mode: 'discovery' as const },
  { id: 'design', label: 'Design', icon: <Palette className="w-5 h-5" />, query: 'Design tools', mode: 'discovery' as const },
  { id: 'ecommerce', label: 'Ecommerce', icon: <ShoppingCart className="w-5 h-5" />, query: 'Ecommerce businesses', mode: 'discovery' as const },
];

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [leads, setLeads] = useState<ProductLead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [targetFilter, setTargetFilter] = useState<'ALL' | 'B2B' | 'D2C'>('ALL');
  const [searchMode, setSearchMode] = useState<'discovery' | 'specific'>('discovery');
  const [isSearching, setIsSearching] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isIdentifyingAll, setIsIdentifyingAll] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [view, setView] = useState<'active' | 'contacted' | 'followup' | 'archive'>('active');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Helper to ensure URL is absolute
  const ensureAbsoluteUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
  };

  // Helper to normalize URLs for aggressive deduplication
  const normalizeUrl = (url: string) => {
    return url.toLowerCase().trim()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '');
  };

  const normalizeName = (name: string) => name.toLowerCase().trim();

  // DERIVED VIEWS
  const activeLeads = useMemo(() => leads.filter(l => !l.isArchived && l.status !== 'contacted'), [leads]);
  const contactedLeads = useMemo(() => leads.filter(l => !l.isArchived && l.status === 'contacted'), [leads]);
  const followupLeads = useMemo(() => leads.filter(l => !l.isArchived && l.status === 'contacted' && l.followUpAssetUrl), [leads]);
  const archivedLeads = useMemo(() => leads.filter(l => l.isArchived), [leads]);

  const currentLead = useMemo(() => leads.find(l => l.id === selectedLeadId) || null, [leads, selectedLeadId]);

  // Filtering based on B2B/D2C buttons
  const displayedLeads = useMemo(() => {
    let base = [];
    if (view === 'active') base = activeLeads;
    else if (view === 'contacted') base = contactedLeads;
    else if (view === 'followup') base = followupLeads;
    else base = archivedLeads;

    if (targetFilter === 'ALL') return base;
    return base.filter(lead => lead.targetType === targetFilter);
  }, [view, activeLeads, contactedLeads, followupLeads, archivedLeads, targetFilter]);

  useEffect(() => {
    let unsubscribe = () => {};
    if (auth) {
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        setUser(firebaseUser);
        setIsInitializing(false);
      });
    }
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.leads) setLeads(data.leads);
      }
    });
    return () => unsubscribe();
  }, [user]);

  const syncToCloud = async (newData: any) => {
    if (!user || !db) return;
    try {
      await setDoc(doc(db, 'users', user.uid), newData, { merge: true });
    } catch (e) {
      console.error("Cloud sync failed", e);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || isSearching) return;
    setIsSearching(true);
    try {
      if (searchMode === 'discovery') {
        const result = await discoverLeads(searchQuery, { 
          targetType: targetFilter === 'ALL' ? 'Both' : targetFilter as any, 
          niche: 'SaaS' 
        });
        
        if (result && Array.isArray(result.leads)) {
          // AGGRESSIVE DEDUPLICATION: Check against ALL leads in history and current discovery
          const existingNames = new Set(leads.map(l => normalizeName(l.name)));
          const existingWebsites = new Set(leads.map(l => normalizeUrl(l.website)));
          
          const newUniqueLeads = result.leads.filter(l => {
            const isDuplicateName = existingNames.has(normalizeName(l.name));
            const isDuplicateUrl = existingWebsites.has(normalizeUrl(l.website));
            // If it exists in History or Discovery, discard it immediately
            return !isDuplicateName && !isDuplicateUrl;
          });

          const updatedLeads = [...newUniqueLeads, ...leads];
          setLeads(updatedLeads);
          await syncToCloud({ leads: updatedLeads });
        }
      } else {
        const result = await searchSpecificBrand(searchQuery);
        if (result && result.lead) {
          const nameNorm = normalizeName(result.lead.name);
          const urlNorm = normalizeUrl(result.lead.website);
          
          const exists = leads.find(l => normalizeName(l.name) === nameNorm || normalizeUrl(l.website) === urlNorm);
          
          if (exists) {
            setSelectedLeadId(exists.id);
            if (exists.isArchived) setView('archive');
            else if (exists.status === 'contacted') setView('contacted');
            else setView('active');
          } else {
            const updatedLeads = [result.lead, ...leads];
            setLeads(updatedLeads);
            await syncToCloud({ leads: updatedLeads });
            setSelectedLeadId(result.lead.id);
          }
        }
      }
    } catch (error) { console.error("Search failed", error); } finally { setIsSearching(false); }
  };

  const handleInvestigate = async (lead: ProductLead) => {
    setLeads(l => l.map(x => x.id === lead.id ? { ...x, status: 'investigating' } : x));
    try {
      const result = await findContactInfo(lead.name, lead.website);
      setLeads(prevLeads => {
        const updated = prevLeads.map(l => l.id === lead.id ? { 
          ...l, contactEmail: result.email, contactName: result.name, status: 'ready' as const
        } : l);
        syncToCloud({ leads: updated });
        return updated;
      });
    } catch (error) {
      console.error("Investigation failed", error);
      setLeads(l => l.map(x => x.id === lead.id ? { ...x, status: 'new' } : x));
    }
  };

  const handleInvestigateAll = async () => {
    const leadsToInvestigate = activeLeads.filter(l => l.status === 'new');
    if (leadsToInvestigate.length === 0) return;
    setIsIdentifyingAll(true);
    await Promise.all(leadsToInvestigate.map(l => handleInvestigate(l)));
    setIsIdentifyingAll(false);
  };

  const handleArchive = async (leadId: string) => {
    const updatedLeads = leads.map(l => l.id === leadId ? { ...l, isArchived: true } : l);
    setLeads(updatedLeads);
    if (selectedLeadId === leadId) setSelectedLeadId(null);
    await syncToCloud({ leads: updatedLeads });
  };

  const handleUnarchive = async (leadId: string) => {
    const updatedLeads = leads.map(l => l.id === leadId ? { ...l, isArchived: false } : l);
    setLeads(updatedLeads);
    await syncToCloud({ leads: updatedLeads });
  };

  const handleMemeSelection = async (leadId: string, url: string) => {
    const updatedLeads = leads.map(l => l.id === leadId ? 
      { ...l, followUpAssetUrl: l.followUpAssetUrl === url ? undefined : url } : l
    );
    setLeads(updatedLeads);
    await syncToCloud({ leads: updatedLeads });
  };

  const handleCopyLink = (url: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopyFeedback("Copied!");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleDraftEmail = async (lead: ProductLead, isFollowUp: boolean = false) => {
    setIsDrafting(true);
    try {
      const draft = await generateOutreachEmail(lead, user?.displayName || 'Me', isFollowUp);
      const updatedLeads = leads.map(l => l.id === lead.id ? (isFollowUp ? { ...l, followUpEmail: draft } : { ...l, generatedEmail: draft }) : l);
      setLeads(updatedLeads);
      await syncToCloud({ leads: updatedLeads });
    } catch (error) { console.error("Email drafting failed", error); } finally { setIsDrafting(false); }
  };

  const handleSendInitialEmail = async (lead: ProductLead) => {
    const subject = encodeURIComponent(`Question about ${lead.name}`);
    const body = encodeURIComponent(lead.generatedEmail || "");
    window.location.href = `mailto:${lead.contactEmail}?subject=${subject}&body=${body}`;
    const updatedLeads = leads.map(l => l.id === lead.id ? { 
      ...l, 
      status: 'contacted' as const,
      contactedAt: new Date().toISOString()
    } : l);
    setLeads(updatedLeads);
    await syncToCloud({ leads: updatedLeads });
  };

  const handleLogout = () => {
    if (auth) auth.signOut();
    window.location.reload();
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (isInitializing) return <div className="h-screen flex items-center justify-center bg-[#050a18]"><Loader2 className="w-16 h-16 animate-spin text-[#da552f]" /></div>;

  return (
    <div className="min-h-screen bg-[#030712] text-[#e2e8f0] flex flex-col">
      {/* Top Header Navigation */}
      <header className="px-12 py-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#030712]/95 backdrop-blur-md z-50">
        <div className="flex items-center gap-5">
          <div className="bg-[#da552f] p-2.5 rounded-2xl shadow-xl">
            <Diamond className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">LeadGen <span className="text-[#da552f]">PRO</span></h1>
        </div>

        <nav className="flex items-center bg-[#0d1526] p-2 rounded-2xl border border-white/5 shadow-2xl">
          <button onClick={() => setView('active')} className={`flex items-center gap-3 px-8 py-3 rounded-xl text-sm font-black uppercase tracking-widest nav-pill ${view === 'active' ? 'bg-[#da552f] text-white shadow-xl' : 'text-slate-400 hover:text-slate-200'}`}>
             DISCOVERY ({activeLeads.length})
          </button>
          <button onClick={() => setView('contacted')} className={`flex items-center gap-3 px-8 py-3 rounded-xl text-sm font-black uppercase tracking-widest nav-pill ${view === 'contacted' ? 'bg-[#252a3a] text-white shadow-xl' : 'text-slate-400 hover:text-slate-200'}`}>
             HISTORY ({contactedLeads.length})
          </button>
          <button onClick={() => setView('followup')} className={`flex items-center gap-3 px-8 py-3 rounded-xl text-sm font-black uppercase tracking-widest nav-pill ${view === 'followup' ? 'bg-[#eab308] text-white shadow-xl' : 'text-slate-400 hover:text-slate-200'}`}>
             FOLLOW-UPS ({followupLeads.length})
          </button>
          <button onClick={() => setView('archive')} className={`flex items-center gap-3 px-8 py-3 rounded-xl text-sm font-black uppercase tracking-widest nav-pill ${view === 'archive' ? 'bg-[#3b82f6] text-white shadow-xl' : 'text-slate-400 hover:text-slate-200'}`}>
             ARCHIVE
          </button>
        </nav>

        <button onClick={handleLogout} className="flex items-center gap-2 text-slate-500 hover:text-white transition-all text-sm font-black uppercase tracking-widest">
          <LogOut className="w-5 h-5" /> LOGOUT
        </button>
      </header>

      {/* Main Layout Grid */}
      <main className="flex-1 dashboard-container grid grid-cols-12">
        
        {/* Left Sidebar */}
        <aside className="col-span-3 space-y-8">
          <div className="bg-[#090f1e] border border-white/5 rounded-3xl p-8 space-y-6 shadow-2xl">
            <div className="flex bg-[#050a18] p-2 rounded-2xl border border-white/5">
              <button onClick={() => setSearchMode('discovery')} className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${searchMode === 'discovery' ? 'bg-[#6366f1] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                <Globe className="w-5 h-5" /> DISCOVERY
              </button>
              <button onClick={() => setSearchMode('specific')} className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${searchMode === 'specific' ? 'bg-[#10b981] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                <Activity className="w-5 h-5" /> CUSTOM
              </button>
            </div>

            <div className="space-y-4">
              <input 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                placeholder={searchMode === 'discovery' ? "Niche: e.g. AI Tools" : "Brand Name: e.g. Notion"}
                className="w-full bg-[#050a18] border border-white/5 rounded-2xl px-5 py-5 text-base text-white outline-none focus:border-[#da552f] transition-all placeholder:text-slate-700"
              />
              <button 
                onClick={handleSearch} 
                disabled={isSearching}
                className={`w-full py-5 rounded-2xl text-sm font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-4 ${searchMode === 'discovery' ? 'bg-[#da552f]/10 text-[#da552f] border border-[#da552f]/20 hover:bg-[#da552f]/20' : 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 hover:bg-[#10b981]/20'}`}
              >
                {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : searchMode === 'discovery' ? <><Search className="w-5 h-5" /> Scrape {targetFilter !== 'ALL' ? targetFilter : ''} Leads</> : <><Rocket className="w-5 h-5" /> Fetch Brand</>}
              </button>
            </div>
          </div>

          <div className="bg-[#090f1e] border border-white/5 rounded-3xl p-8">
            <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-[0.3em] mb-6 px-1">QUICK SEGMENTS</h3>
            <div className="space-y-3">
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => { setSearchQuery(cat.query); setSearchMode(cat.mode); }} className={`w-full flex items-center gap-5 px-5 py-4 rounded-xl text-base font-bold border transition-all ${searchQuery === cat.query ? 'bg-white/5 border-white/10 text-white shadow-inner translate-x-2' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-200 hover:bg-white/5'}`}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Content Feed */}
        <section className="col-span-5 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-base font-black text-slate-500 flex items-center gap-4 uppercase tracking-widest">
                <div className="w-3 h-3 rounded-full bg-[#da552f] animate-pulse"></div>
                {view === 'active' ? 'ACTIVE LEADS' : view === 'followup' ? 'FOLLOW-UP QUEUE' : view === 'contacted' ? 'HISTORY' : 'ARCHIVE'}
              </h2>
              {view === 'active' && activeLeads.some(l => l.status === 'new') && (
                <button 
                  onClick={handleInvestigateAll} 
                  disabled={isIdentifyingAll}
                  className="px-5 py-2.5 bg-[#da552f]/10 border border-[#da552f]/20 hover:bg-[#da552f]/20 rounded-xl text-xs font-black text-[#da552f] uppercase tracking-widest transition-all"
                >
                  {isIdentifyingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : 'IDENTIFY ALL FOUNDERS'}
                </button>
              )}
            </div>

            {/* B2B / B2C Button Filter */}
            <div className="bg-[#0d1526]/50 border border-white/5 rounded-[1.5rem] p-2 flex items-center shadow-inner">
               <button 
                onClick={() => setTargetFilter('ALL')} 
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${targetFilter === 'ALL' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
               >
                 <Layers className="w-4 h-4" /> ALL
               </button>
               <button 
                onClick={() => setTargetFilter('B2B')} 
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${targetFilter === 'B2B' ? 'bg-[#da552f] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
               >
                 <Briefcase className="w-4 h-4" /> B2B
               </button>
               <button 
                onClick={() => setTargetFilter('D2C')} 
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${targetFilter === 'D2C' ? 'bg-[#10b981] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
               >
                 <Users className="w-4 h-4" /> D2C
               </button>
            </div>
          </div>

          <div className="space-y-4 h-[calc(100vh-19rem)] overflow-y-auto pr-4 custom-scrollbar">
            {displayedLeads.map((lead) => (
              <div 
                key={lead.id} 
                onClick={() => setSelectedLeadId(lead.id)} 
                className={`lead-card p-6 rounded-3xl transition-all cursor-pointer relative group ${selectedLeadId === lead.id ? 'active' : ''}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-4">
                    <a 
                      href={ensureAbsoluteUrl(lead.website)} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      onClick={(e) => e.stopPropagation()} 
                      className="flex items-center gap-3 hover:text-[#da552f] transition-all"
                    >
                      <h3 className="text-base font-bold text-white group-hover:text-[#da552f] transition-colors">{lead.name}</h3>
                      <ExternalLink className="w-4 h-4 text-slate-600" />
                    </a>
                    {lead.targetType && (
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${lead.targetType === 'B2B' ? 'bg-[#da552f]/10 text-[#da552f] border-[#da552f]/20' : 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20'}`}>
                        {lead.targetType}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {lead.contactedAt && (
                      <div className="flex items-center gap-2 text-xs font-black text-[#6366f1] bg-[#6366f1]/10 px-4 py-1.5 rounded-xl border border-[#6366f1]/20 uppercase">
                        <Calendar className="w-4 h-4" /> {formatDate(lead.contactedAt)}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {view !== 'archive' ? (
                        <button onClick={(e) => { e.stopPropagation(); handleArchive(lead.id); }} className="opacity-0 group-hover:opacity-100 p-2 hover:bg-rose-500/10 text-slate-700 hover:text-rose-500 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); handleUnarchive(lead.id); }} className="p-2 hover:bg-[#10b981]/10 text-slate-700 hover:text-[#10b981] rounded-xl transition-all"><RotateCcw className="w-5 h-5" /></button>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-slate-500 font-medium italic mb-5 leading-relaxed line-clamp-2">"{lead.tagline}"</p>
                <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-4">
                  <div className="flex items-center gap-4">
                    <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${lead.status === 'contacted' ? 'bg-[#6366f1]/10 text-[#6366f1] border-[#6366f1]/20' : lead.status === 'ready' ? 'bg-[#da552f]/10 text-[#da552f] border-[#da552f]/20' : lead.status === 'investigating' ? 'bg-[#eab308]/10 text-[#eab308] border-[#eab308]/20 animate-pulse' : 'bg-slate-800 text-slate-600 border-white/5'}`}>{lead.status.toUpperCase()}</div>
                    <a 
                      href={ensureAbsoluteUrl(lead.website)} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      onClick={(e) => e.stopPropagation()} 
                      className="text-xs text-slate-600 font-bold hover:text-white transition-colors uppercase tracking-tight"
                    >
                      {lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    </a>
                  </div>
                  <div className="flex items-center gap-4">
                    {lead.followUpAssetUrl && <Smile className="w-5 h-5 text-[#eab308]" />}
                    {lead.contactEmail && <Mail className="w-5 h-5 text-[#10b981]" />}
                  </div>
                </div>
              </div>
            ))}
            {displayedLeads.length === 0 && (
              <div className="flex flex-col items-center justify-center py-32 bg-white/2 border-2 border-dashed border-white/5 rounded-[3rem] opacity-20">
                <Bookmark className="w-16 h-16 mb-6 text-slate-400" />
                <p className="text-sm font-black uppercase tracking-[0.4em] text-slate-300">NO LEADS MATCHED</p>
              </div>
            )}
          </div>
        </section>

        {/* Right Sidebar - Campaign Kit */}
        <aside className="col-span-4 sticky top-40">
          {currentLead ? (
            <div className="bg-[#0d1526] border border-white/5 rounded-[2.5rem] p-10 space-y-10 shadow-2xl relative overflow-hidden active-glow border-t-4 border-t-[#da552f]/40">
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">CAMPAIGN KIT</h2>
                  <div className="flex items-center gap-3 mt-2">
                    <a 
                      href={ensureAbsoluteUrl(currentLead.website)} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-sm text-slate-600 font-bold uppercase tracking-widest hover:text-[#da552f] transition-all"
                    >
                      {currentLead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    </a>
                    {currentLead.contactedAt && (
                      <span className="text-[10px] bg-[#6366f1] text-white px-2 py-0.5 rounded-md font-black uppercase">CONTACTED {formatDate(currentLead.contactedAt)}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedLeadId(null)} className="p-2.5 text-slate-700 hover:text-white transition-all bg-white/5 rounded-full"><X className="w-6 h-6" /></button>
              </div>

              <div className="space-y-8 relative z-10">
                <div className="bg-[#050a18]/70 border border-white/5 rounded-3xl p-8 space-y-5 shadow-inner">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-lg text-white tracking-tight">{currentLead.name}</h3>
                    <a 
                      href={ensureAbsoluteUrl(currentLead.website)} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="p-2 bg-white/5 rounded-xl hover:bg-[#da552f] text-slate-400 hover:text-white transition-all"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                  <p className="text-base text-slate-400 leading-relaxed font-medium line-clamp-6">{currentLead.description}</p>
                </div>

                {view === 'followup' && (
                  <div className="space-y-6 border-t border-white/5 pt-8">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-[#eab308] uppercase tracking-[0.2em] flex items-center gap-3">
                        <Smile className="w-5 h-5" /> HUMOR ASSETS
                      </p>
                      {currentLead.followUpAssetUrl && (
                        <button 
                          onClick={() => handleCopyLink(currentLead.followUpAssetUrl!)} 
                          className="flex items-center gap-2 text-[11px] font-black text-slate-400 hover:text-white transition-all bg-white/5 px-4 py-2 rounded-xl border border-white/5"
                        >
                          {copyFeedback ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          {copyFeedback || "COPY ASSET URL"}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {DEFAULT_MEME_LIBRARY.map((meme, i) => (
                        <div key={i} className="relative group">
                          <button 
                            onClick={() => handleMemeSelection(currentLead.id, meme.url)} 
                            className={`w-full aspect-square rounded-2xl overflow-hidden border-2 transition-all relative ${currentLead.followUpAssetUrl === meme.url ? 'border-[#eab308] shadow-lg shadow-[#eab308]/30 scale-105' : 'border-white/5 opacity-50 group-hover:opacity-100'}`}
                          >
                            <img src={meme.url} className="w-full h-full object-cover" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  {view === 'followup' ? (
                    <>
                      <div className="bg-[#050a18]/70 border border-white/5 rounded-3xl p-6 shadow-inner">
                        <p className="text-[11px] font-black text-slate-600 uppercase mb-5 tracking-widest">PERSONALIZED BUMP</p>
                        {currentLead.followUpEmail ? (
                           <textarea 
                             value={currentLead.followUpEmail} 
                             onChange={(e) => setLeads(leads.map(l => l.id === currentLead.id ? {...l, followUpEmail: e.target.value} : l))} 
                             className="w-full bg-transparent text-sm text-slate-300 min-h-[180px] resize-none outline-none leading-relaxed font-semibold custom-scrollbar" 
                           />
                        ) : (
                          <button onClick={() => handleDraftEmail(currentLead, true)} disabled={isDrafting} className="w-full py-10 border-2 border-dashed border-white/10 rounded-[2rem] text-xs font-black uppercase text-slate-600 hover:text-[#eab308] hover:border-[#eab308]/30 transition-all flex flex-col items-center gap-4">
                             {isDrafting ? <Loader2 className="w-8 h-8 animate-spin" /> : <><Sparkles className="w-6 h-6" /> GENERATE HUMOROUS PITCH</>}
                          </button>
                        )}
                      </div>
                      <button onClick={() => {
                        const subject = encodeURIComponent(`Quick check: ${currentLead.name} x UGC partnership`);
                        const body = encodeURIComponent(currentLead.followUpEmail || "Checking in!");
                        window.location.href = `mailto:${currentLead.contactEmail}?subject=${subject}&body=${body}`;
                      }} className="w-full py-6 bg-[#da552f] hover:bg-[#ff6d45] text-white font-black rounded-2xl text-sm uppercase tracking-[0.3em] shadow-xl shadow-[#da552f]/20 transition-all active:scale-[0.98]">
                         SEND HUMOROUS BUMP
                      </button>
                    </>
                  ) : !currentLead.contactEmail ? (
                    <button onClick={() => handleInvestigate(currentLead)} disabled={currentLead.status === 'investigating'} className="w-full py-6 bg-[#da552f] hover:bg-[#ff6d45] text-white font-black rounded-2xl text-sm uppercase tracking-[0.3em] shadow-xl shadow-[#da552f]/20 transition-all active:scale-[0.98]">
                       {currentLead.status === 'investigating' ? <Loader2 className="w-6 h-6 animate-spin" /> : "IDENTIFY DECISION MAKER"}
                    </button>
                  ) : (
                    <div className="space-y-6">
                      <div className="p-6 bg-[#050a18]/80 rounded-[2rem] border border-[#10b981]/15 flex items-center gap-6 shadow-2xl">
                        <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center border border-white/5 shadow-inner"><User className="w-8 h-8 text-[#da552f]" /></div>
                        <div>
                          <p className="text-base font-black text-white leading-none tracking-tight">{currentLead.contactName || 'Founder / Marketing'}</p>
                          <p className="text-sm text-[#10b981] font-bold mt-3 tracking-tight uppercase opacity-95">{currentLead.contactEmail}</p>
                        </div>
                      </div>
                      {!currentLead.generatedEmail ? (
                        <button onClick={() => handleDraftEmail(currentLead)} disabled={isDrafting} className="w-full py-16 border-2 border-dashed border-white/10 rounded-[3rem] text-sm font-black uppercase text-slate-600 hover:text-[#da552f] hover:border-[#da552f]/30 transition-all flex flex-col items-center gap-5">
                          {isDrafting ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Sparkles className="w-10 h-10 text-[#da552f]" /> PERSONALIZE OUTREACH</>}
                        </button>
                      ) : (
                        <div className="space-y-5">
                          <div className="bg-[#050a18]/70 border border-white/5 rounded-3xl p-6 shadow-inner">
                             <textarea 
                               value={currentLead.generatedEmail} 
                               onChange={(e) => setLeads(leads.map(l => l.id === currentLead.id ? {...l, generatedEmail: e.target.value} : l))} 
                               className="w-full bg-transparent text-sm text-slate-300 min-h-[220px] resize-none outline-none leading-relaxed font-semibold custom-scrollbar" 
                             />
                          </div>
                          <button onClick={() => handleSendInitialEmail(currentLead)} className="w-full py-6 bg-[#da552f] hover:bg-[#ff6d45] text-white font-black rounded-2xl text-sm uppercase tracking-[0.3em] shadow-xl shadow-[#da552f]/20 transition-all active:scale-[0.98]">
                             SEND INITIAL OUTREACH
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 bg-white/2 border-2 border-dashed border-white/5 rounded-[3rem] opacity-10 h-[600px]">
              <Activity className="w-16 h-16 text-slate-900 mb-10" />
              <p className="text-sm font-black uppercase tracking-[0.4em] text-center max-w-[250px] leading-relaxed text-slate-800">CHOOSE A RECORD TO DEPLOY</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
};

export default App;
