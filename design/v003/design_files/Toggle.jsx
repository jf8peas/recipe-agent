function Toggle({ checked, onChange, label }) {
  return (
    <label style={{display:'flex',alignItems:'center',gap:'var(--space-2)',fontSize:'var(--text-sm)',cursor:'pointer',userSelect:'none'}}>
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!checked); } }}
        style={{position:'relative',width:36,height:20,borderRadius:999,background:checked?'var(--color-accent)':'var(--color-border)',transition:'background 0.15s ease',flexShrink:0,display:'inline-block'}}
      >
        <span style={{position:'absolute',top:2,left:checked?18:2,width:16,height:16,borderRadius:'50%',background:'var(--color-surface)',boxShadow:'var(--shadow-sm)',transition:'left 0.15s ease'}} />
      </span>
      {label}
    </label>
  );
}
window.Toggle = Toggle;
