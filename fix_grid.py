
import os

path = r'e:\ANTIGRAVITY\10X\dashboard\app\page.tsx'
with open(path, 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

# Goal: Fix the campaign grid and remove duplicates.
# We know the campDetail ternary starts around 1917.
# {!campDetail ? (
#   <>
#     ...
#   </>
# ) : (

# Let's find the indices.
start_ternary = -1
for i, line in enumerate(lines):
    if '{!campDetail ? (' in line:
        start_ternary = i
        break

if start_ternary == -1:
    print("Could not find start of ternary")
    exit(1)

# Find the end of the first branch </>.
# It should be followed by ) : ( for the second branch.
# We suspect there is garbage between them.

end_fragment = -1
for i in range(start_ternary, len(lines)):
    if '</>' in lines[i]:
        # Check if next non-empty line has ') : (' or starts with it.
        found_second = False
        for j in range(i+1, min(i+100, len(lines))):
            if ') : (' in lines[j] or ') : activeTab' in lines[j]: # Safety check
                found_second = True
                break
        if found_second:
            # This might be a valid one or a duplicate.
            # But wait, if we have DUPLICATES, we might find the WRONG one.
            pass

# Let's just reconstruct the whole block from 1900 to 2500.
# I'll replace everything between the start of CAMPANHAS tab and the end of it.

start_tab = -1
for i, line in enumerate(lines):
    if "activeTab === 'CAMPANHAS' ?" in line:
        start_tab = i
        break

end_tab = -1
# The CAMPANHAS tab ends with a ) followed by a : for the NEXT tab (Historico).
for i in range(start_tab + 1, len(lines)):
    if ') : (' in lines[i] and 'historicoTab' in lines[i+1]: # VERY specific
        end_tab = i
        break
    # Or maybe it's the very last ) : (
    if ') : (' in lines[i]:
        next_lines = "".join(lines[i+1:i+5])
        if 'historicoTab' in next_lines:
            end_tab = i
            break

if start_tab != -1 and end_tab != -1:
    print(f"Found CAMPANHAS tab from {start_tab} to {end_tab}")
    
    # Reconstruct the block.
    # I'll use the correct logic.
    new_campanhas_block = """        ) : activeTab === 'CAMPANHAS' ? (
          <div className="flex flex-col gap-6 pb-12">
            {!campDetail ? (
              <>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center shadow-sm"><span className="material-symbols-outlined text-lg">campaign</span></div>
                      <div>
                        <h2 className="font-headline font-black text-2xl text-slate-800 mb-0.5">Minhas Campanhas</h2>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-none">Total: {state.tableData.length} campanhas no per\xfodo</p>
                      </div>
                   </div>

                   <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                        {OBJ_TABS_DEF.map(item => (
                          <button key={item.tab} onClick={() => setCampTab(item.tab)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all focus:outline-none flex items-center gap-1.5 ${campTab === item.tab ? 'bg-white text-violet-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                            {item.tab}
                          </button>
                        ))}
                      </div>

                      <div className="relative group">
                         <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm group-focus-within:text-violet-500">search</span>
                         <input type="text" placeholder="Buscar campanha..." 
                           value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                           className="bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2 text-sm font-semibold focus:ring-2 ring-violet-300 outline-none w-[240px] transition-all shadow-sm" />
                      </div>
                   </div>
                </div>

                <div className="bg-surface-container-low rounded-3xl p-8 border-slate-100 shadow-sm relative min-h-[400px]">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                   {(() => {
                     const filtered = state.tableData
                       .filter(c => campTab === 'GERAL' || c.objective === campTab)
                       .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()));
                     
                     const limited = filtered.slice(0, MAX_TOTAL);
                     const paginated = limited.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

                     if (paginated.length === 0) {
                       return <div className="col-span-full py-20 text-center font-black text-slate-300 uppercase tracking-widest">Nenhuma campanha encontrada</div>;
                     }

                     return paginated.map((camp: any) => {
                       const pal = PALETTE[camp.objective as keyof typeof PALETTE] || PALETTE.OUTROS;
                       const isSelected = selectedIds.has(camp.id);
                       const toggleItem = (e: React.MouseEvent) => {
                         e.stopPropagation();
                         setSelectedIds(prev => {
                           const next = new Set(prev);
                           if (next.has(camp.id)) { next.delete(camp.id); } 
                           else {
                             const firstId = Array.from(next)[0];
                             const firstCamp = state.tableData.find((c: any) => c.id === firstId);
                             if (firstCamp && firstCamp.objective !== camp.objective) {
                               setNiceAlert({ title: 'Sele\xe7\xe3o Inv\xe1lida', message: `S\xf3 \xe9 poss\xedvel consolidar campanhas do mesmo tipo.\\n\\nSua sele\xe7\xe3o atual \xe9 do tipo ${firstCamp.objective}.` });
                               return prev;
                             }
                             next.add(camp.id);
                           }
                           return next;
                         });
                       };

                       return (
                         <div key={camp.id} onClick={() => viewCampaignDetail(camp)}
                              className={`group cursor-pointer bg-white border ${isSelected ? 'border-violet-600 ring-2 ring-violet-600/20' : 'border-slate-200 hover:border-violet-400'} p-5 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[170px] relative overflow-hidden`}>
                           <div className={`absolute top-0 left-0 w-1 h-full opacity-20 group-hover:opacity-100 transition-opacity ${pal.bg} ${isSelected ? 'opacity-100' : ''}`} />
                           <div className="relative">
                             <div className="flex justify-between items-start mb-2">
                               <div className="flex items-center gap-2">
                                  <div onClick={toggleItem} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-violet-600 border-violet-600' : 'border-slate-200 bg-slate-50'}`}>
                                    {isSelected && <span className="material-symbols-outlined text-white text-[14px] font-bold">check</span>}
                                  </div>
                                  <StatusBadge status={camp.status} />
                               </div>
                               <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-lg ${pal.bg} text-white shadow-sm`}>{camp.objective}</span>
                             </div>
                             <p className="font-headline font-black text-slate-800 text-[13px] line-clamp-2 pr-2 mb-1.5 group-hover:text-violet-600 transition-colors leading-tight">{camp.name}</p>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{camp.createdTime ? `Criada: ${D(camp.createdTime)}` : 'Indispon\xedvel'}</p>
                           </div>
                           <div className="mt-4 pt-3 border-t border-slate-50 grid grid-cols-2 gap-y-3">
                              <div>
                                 <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gasto</p>
                                 <p className="font-black text-sm text-slate-800">{R(camp.spend)}</p>
                              </div>
                              
                              {camp.objective === 'VENDAS' && (
                                 <>
                                    <div className="text-right">
                                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Faturamento (H)</p><p className={`font-black text-sm ${pal.text}`}>{R(camp.hotmartRevenue || 0)}</p>
                                    </div>
                                    <div>
                                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CPA (H)</p><p className="font-black text-sm text-slate-800">{R(camp.spend / (camp.hotmartPurchases || 1))}</p>
                                    </div>
                                    <div className="text-right">
                                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ROI (H)</p><p className="font-black text-sm text-emerald-600">{(camp.spend > 0 ? (camp.hotmartRevenue / camp.spend) : 0).toFixed(2)}x</p>
                                    </div>
                                 </>
                              )}
                              
                              {camp.objective === 'LEADS' && (
                                 <>
                                    <div className="text-right">
                                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Leads</p>
                                       <p className={`font-black text-sm ${pal.text}`}>{N(camp.leads)}</p>
                                    </div>
                                    <div>
                                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CPL</p>
                                       <p className="font-black text-sm text-slate-800">{R(camp.costPerLead)}</p>
                                    </div>
                                    <div className="text-right">
                                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CTR</p>
                                       <p className="font-black text-sm text-slate-600">{P(camp.ctr)}</p>
                                    </div>
                                 </>
                              )}

                              {(camp.objective !== 'VENDAS' && camp.objective !== 'LEADS') && (
                                 <>
                                    <div className="text-right">
                                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Cliques</p>
                                       <p className={`font-black text-sm ${pal.text}`}>{N(camp.outboundClicks)}</p>
                                    </div>
                                    <div>
                                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Impress\xf5es</p>
                                       <p className="font-black text-sm text-slate-800">{N(camp.impressions)}</p>
                                    </div>
                                    <div className="text-right">
                                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CTR</p>
                                       <p className="font-black text-sm text-slate-600">{P(camp.ctr)}</p>
                                    </div>
                                 </>
                              )}
                           </div>
                         </div>
                       );
                     });
                   })()}
                  </div>

                  {/* Pagination Controls - GRID */}
                  <div className="flex items-center justify-between pt-8 border-t border-slate-50">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                         {Math.min(state.tableData.length, MAX_TOTAL)} campanhas vis\xedveis
                      </p>
                      <div className="flex items-center gap-2">
                          <button 
                            disabled={currentPage === 0}
                            onClick={() => setCurrentPage(p => p - 1)}
                            className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-violet-600 disabled:opacity-30 transition-all flex items-center justify-center shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                          </button>
                           <div className="flex gap-1.5">
                            {Array.from({length: Math.ceil(Math.min(state.tableData.length, MAX_TOTAL) / PAGE_SIZE)}).map((_, idx) => (
                              <button key={idx} onClick={() => setCurrentPage(idx)}
                                className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black transition-all ${currentPage === idx ? 'bg-violet-600 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-100 hover:border-violet-200 shadow-sm'}`}>
                                {idx + 1}
                              </button>
                            ))}
                           </div>
                          <button 
                            disabled={currentPage >= Math.ceil(Math.min(state.tableData.length, MAX_TOTAL) / PAGE_SIZE) - 1}
                            onClick={() => setCurrentPage(p => p + 1)}
                            className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-violet-600 disabled:opacity-30 transition-all flex items-center justify-center shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                          </button>
                      </div>
                  </div>
                
               {state.tableData.filter(c => campTab === 'GERAL' || c.objective === campTab).length === 0 && (
                  <div className="py-12 text-center">
                     <span className="material-symbols-outlined text-slate-200 text-6xl mb-4">folder_open</span>
                     <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhuma campanha encontrada</p>
                  </div>
               )}
            </div>
          </>
        ) : (
    """.strip()

    # Re-wrap the detail view and following part to make sure it's valid.
    # We'll keep the lines from lines[end_tab:] as they are.
    
    final_lines = lines[:start_tab] + [new_campanhas_block + "\\n"] + lines[end_tab:]
    
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(final_lines)
    print("Successfully rewritten CAMPANHAS tab.")
else:
    print(f"Could not find tab markers: start={start_tab}, end={end_tab}")
