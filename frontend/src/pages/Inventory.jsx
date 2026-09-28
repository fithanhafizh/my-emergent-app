import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Package, Plus } from "lucide-react";

export default function Inventory() {
  const [inv, setInv] = useState([]); const [exp, setExp] = useState([]);
  const [item, setItem] = useState({ name: "", stock: 0, unit: "pcs", min_stock: 0 });
  const [expF, setExpF] = useState({ date: new Date().toISOString().slice(0, 10), category: "Bahan", description: "", amount: 0 });
  const load = () => { api.get("/inventory").then(r => setInv(r.data)); api.get("/expenses").then(r => setExp(r.data)); };
  useEffect(() => { load(); }, []);
  const addItem = async () => { if (!item.name) return; await api.post("/inventory", { ...item, stock: Number(item.stock), min_stock: Number(item.min_stock) }); setItem({ name: "", stock: 0, unit: "pcs", min_stock: 0 }); load(); };
  const addExp = async () => { if (!expF.description) return; await api.post("/expenses", { ...expF, amount: Number(expF.amount) }); setExpF({ ...expF, description: "", amount: 0 }); load(); };
  const total = exp.reduce((s, e) => s + (e.amount || 0), 0);
  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <span className="eyebrow">DENTAL KIT</span>
          <h1>Inventory & expense tracker</h1>
          <p>Pantau stok bahan pribadi dan biaya operasional klinik.</p>
        </div>
      </div>
      <div className="lower-grid">
        <section className="clean-section">
          <div className="panel-heading"><div><span className="eyebrow">INVENTORY</span><h3>Stok bahan & alat</h3></div></div>
          <div className="inline-form">
            <input data-testid="inv-name" placeholder="Nama bahan" value={item.name} onChange={e => setItem({ ...item, name: e.target.value })} />
            <input data-testid="inv-stock" type="number" placeholder="Stok" value={item.stock} onChange={e => setItem({ ...item, stock: e.target.value })} />
            <input data-testid="inv-unit" placeholder="Unit" value={item.unit} onChange={e => setItem({ ...item, unit: e.target.value })} />
            <input data-testid="inv-min" type="number" placeholder="Min" value={item.min_stock} onChange={e => setItem({ ...item, min_stock: e.target.value })} />
            <button data-testid="inv-add" className="primary-button" onClick={addItem}><Plus size={14} /> Tambah</button>
          </div>
          <ul className="inv-list">
            {inv.length === 0 && <li className="empty-inline">Belum ada item.</li>}
            {inv.map(i => (
              <li key={i.id} data-testid={`inv-${i.id}`} className={i.stock <= i.min_stock ? "low" : ""}>
                <Package size={14} /> <strong>{i.name}</strong>
                <span>{i.stock} {i.unit}</span>
                {i.stock <= i.min_stock && <em>Menipis</em>}
              </li>
            ))}
          </ul>
        </section>
        <section className="clean-section">
          <div className="panel-heading"><div><span className="eyebrow">EXPENSE</span><h3>Pengeluaran · Rp {total.toLocaleString("id-ID")}</h3></div></div>
          <div className="inline-form">
            <input data-testid="exp-date" type="date" value={expF.date} onChange={e => setExpF({ ...expF, date: e.target.value })} />
            <input data-testid="exp-cat" placeholder="Kategori" value={expF.category} onChange={e => setExpF({ ...expF, category: e.target.value })} />
            <input data-testid="exp-desc" placeholder="Deskripsi" value={expF.description} onChange={e => setExpF({ ...expF, description: e.target.value })} />
            <input data-testid="exp-amt" type="number" placeholder="Nominal" value={expF.amount} onChange={e => setExpF({ ...expF, amount: e.target.value })} />
            <button data-testid="exp-add" className="primary-button" onClick={addExp}><Plus size={14} /> Catat</button>
          </div>
          <ul className="exp-list">
            {exp.length === 0 && <li className="empty-inline">Belum ada pengeluaran.</li>}
            {exp.map(e => (
              <li key={e.id} data-testid={`exp-${e.id}`}>
                <small>{e.date}</small>
                <div><strong>{e.description}</strong><span>{e.category}</span></div>
                <b>Rp {(e.amount || 0).toLocaleString("id-ID")}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
