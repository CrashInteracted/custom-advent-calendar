import React, {useState, useEffect, useRef} from 'react'
import * as LZ from 'lz-string'

const defaultDoors = Array.from({length:24}).map((_,i)=>({
  id:i+1,
  x: (i%6)*150 + 20,
  y: Math.floor(i/6)*120 + 20,
  w:120, h:90,
  color: '#09a2e9ff',
  borderRadius:0,
  openingSide:'right',
  outline:'thin',
  background:true,
  showNumber:true,
  closedLabel: '',
  content:`${i+1}`,
  openingDate: (()=>{const d=new Date(); d.setMonth(11); d.setDate(i+1); d.setHours(0,0,0,0); return d.toISOString()})()
}))

function todayISO(){const d=new Date(); d.setHours(0,0,0,0); return d.toISOString()}

function encodeState(state){try{return LZ.compressToEncodedURIComponent(JSON.stringify(state))}catch(e){return ''}}
function decodeState(code){try{const s=LZ.decompressFromEncodedURIComponent(code); return JSON.parse(s)}catch(e){return null}}

export default function App(){
  const [doors,setDoors]=useState(()=>defaultDoors)
  const [bgImage,setBgImage]=useState(null)
  const [editMode,setEditMode]=useState(()=>window.location.pathname.startsWith('/editmode'))
  const [selected,setSelected]=useState(null)
  const [globalName,setGlobalName]=useState('My Calendar')
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false)

  const calendarRef = useRef(null)
  const baseWidth = 1920
  const baseHeight = 1080
  const [displaySize,setDisplaySize] = useState({width: baseWidth, height: baseHeight})
  const [preserveAspect,setPreserveAspect] = useState(true)
  const [imgNatural, setImgNatural] = useState(null)
  const imgUrlRef = useRef(null)

  // load code from path or query at start
  useEffect(()=>{
    const path = window.location.pathname.replace(/^\//,'')
    if(path.startsWith('editmode/')){
      const code = path.split('/')[1]
      const d = code && decodeState(code)
      if(d){setDoors(d.doors||defaultDoors); setBgImage(d.bg||null)}
    } else if(path){
      const d = decodeState(path)
      if(d){setDoors(d.doors||defaultDoors); setBgImage(d.bg||null)}
    }
  },[])

  useEffect(()=>{
    // toggle edit mode if exact path /edit
    const path = window.location.pathname
    if(path==="/edit") setEditMode(true)
  },[])

  // measure calendar display size and update on resize
  useEffect(()=>{
    let raf = null
    function measure(){
      const el = calendarRef.current
      if(!el) return setDisplaySize({width: baseWidth, height: baseHeight})
      const r = el.getBoundingClientRect()
      // schedule update via rAF to avoid layout thrash
      if(raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(()=>{
        setDisplaySize({width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height))})
        raf = null
      })
    }
    measure()
    window.addEventListener('resize', measure)
    const obs = new ResizeObserver(measure)
    if(calendarRef.current) obs.observe(calendarRef.current)
    return ()=>{window.removeEventListener('resize', measure); obs.disconnect(); if(raf) cancelAnimationFrame(raf)}
  },[])

  // revoke object URL on unmount
  useEffect(()=>{
    return ()=>{ if(imgUrlRef.current){ try{ URL.revokeObjectURL(imgUrlRef.current) }catch(e){} imgUrlRef.current = null } }
  },[])

  function exportCode(edit=false){
    const payload={doors,bg:bgImage,name:globalName}
    const code = encodeState(payload)
    if(edit) return `/editmode/${code}`
    return `/${code}`
  }

  function handleImportCode(text,edit=false){
    const d = decodeState(text)
    if(d){setDoors(d.doors||doors); setBgImage(d.bg||null); if(edit) setEditMode(true)}
  }

  function onBgFile(file){
    // Use object URL to avoid creating large base64 strings and blocking main thread
    if(imgUrlRef.current){ URL.revokeObjectURL(imgUrlRef.current); imgUrlRef.current = null }
    const url = URL.createObjectURL(file)
    imgUrlRef.current = url
    // decode image off the render path to let browser handle decoding and measure natural size
    const img = new Image()
    img.onload = () => {
      // store natural size and aspect ratio to avoid squishing the image
      const natAspect = img.naturalWidth / img.naturalHeight
      setImgNatural({w: img.naturalWidth, h: img.naturalHeight, aspect: natAspect})
      // set background image to the object URL (fast)
      setBgImage(url)
      // allow browser to finish paint before heavy reflows
      requestAnimationFrame(()=>{})
    }
    img.onerror = ()=>{
      // fallback: revoke and clear
      try{ URL.revokeObjectURL(url) }catch(e){}
      imgUrlRef.current = null
    }
    img.src = url
  }

  function updateDoor(id,patch){setDoors(ds=>ds.map(d=>d.id===id?({...d,...patch}):d))}

  function onClickDoor(d){
    const now=new Date(); const openDate=new Date(d.openingDate)
    if(now>=openDate && !editMode){ // open door with animation, then show content
      if(!d.open){
        updateDoor(d.id,{open:true})
        // show popup after animation duration (~650ms)
        setTimeout(()=>{
          setModal({open:true, content:d.content})
        }, 700)
      } else {
        // already open: show content immediately
        setModal({open:true, content:d.content})
      }
    } else {
      // locked
    }
    if(editMode) setSelected(d.id)
  }

  // drag in base coordinate system (doors stored in base coords)
  const dragRef = useRef({dragging:false,id:null,ox:0,oy:0})
  const [modal,setModal] = useState({open:false, content:null})
  function onMouseDownDoor(e,d){
    if(!editMode) return
    e.stopPropagation()
    const el = calendarRef.current
    const rect = el?.getBoundingClientRect() || {left:0,top:0}
    const scaleX = displaySize.width / baseWidth
    const scaleY = displaySize.height / baseHeight
    const pointerBaseX = (e.clientX - rect.left) / scaleX
    const pointerBaseY = (e.clientY - rect.top) / scaleY
    dragRef.current = {dragging:true, id:d.id, ox: pointerBaseX - d.x, oy: pointerBaseY - d.y}
  }

  useEffect(()=>{
    function onMove(e){
      if(!dragRef.current.dragging) return
      const {id,ox,oy} = dragRef.current
      const el = calendarRef.current
      if(!el) return
      const rect = el.getBoundingClientRect()
      const scaleX = displaySize.width / baseWidth
      const scaleY = displaySize.height / baseHeight
      const pointerBaseX = (e.clientX - rect.left) / scaleX
      const pointerBaseY = (e.clientY - rect.top) / scaleY
      const nx = Math.max(0, pointerBaseX - ox)
      const ny = Math.max(0, pointerBaseY - oy)
      updateDoor(id, {x: nx, y: ny})
    }
    function onUp(){ dragRef.current = {dragging:false,id:null,ox:0,oy:0} }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return ()=>{ window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  },[displaySize])

  // close modal helper
  function closeModal(){
    setModal({open:false, content:null})
  }

  // If image has natural aspect, use it; otherwise use calendar's 4:3 aspect
  const imgAspect = imgNatural?.aspect || (baseWidth / baseHeight)
  const calendarWidth = baseWidth
  const calendarHeight = Math.round(calendarWidth / imgAspect)
  
  // In viewing mode, always scale to fit window maintaining aspect ratio
  // In edit mode, scale to fit while maintaining aspect
  const viewportScale = Math.min(window.innerWidth/calendarWidth, window.innerHeight/calendarHeight)
  const eff = {width: Math.round(calendarWidth * viewportScale), height: Math.round(calendarHeight * viewportScale)}

  return (
    <div className="app">
      <div className="canvas">
        <div ref={calendarRef} className={`calendar ${!editMode? 'fullscreen':''}`} style={{
          backgroundImage:bgImage?`url(${bgImage})`:'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          width: `${eff.width}px`,
          height: `${eff.height}px`,
          aspectRatio: imgAspect
        }}>
          {(() => {
            const imgAspect2 = imgNatural?.aspect || (baseWidth / baseHeight)
            const calHeight = Math.round(baseWidth / imgAspect2)
            const effCalc = {width: eff.width, height: eff.height}

            const bgSizeStr = `${effCalc.width}px ${effCalc.height}px`

            return doors.map(d=>{
              const openable = new Date()>=new Date(d.openingDate)
              const scaleX = effCalc.width / baseWidth
              const scaleY = effCalc.height / calHeight
              const left = d.x * scaleX
              const top = d.y * scaleY
              const width = d.w * scaleX
              const height = d.h * scaleY
              const borderRadius = Math.max(0, d.borderRadius * Math.min(scaleX, scaleY))
              const style = {left, top, width, height, background: d.color, borderRadius: borderRadius + 'px', overflow:'hidden', position:'absolute', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff'}
              // compute overlay style for outline that sits on top of the image (does not affect background size)
              const thicknessBase = Math.max(1, Math.round(2 * Math.min(scaleX, scaleY)))
              const overlayStyle = {position:'absolute', inset:0, borderRadius: borderRadius + 'px', pointerEvents:'none', boxSizing:'border-box', zIndex:2}
              if(d.outline === 'thin') overlayStyle.border = `${thicknessBase}px solid rgba(255,255,255,0.9)`
              if(d.outline === 'thick') overlayStyle.border = `${Math.max(2, Math.round(6 * Math.min(scaleX, scaleY)))}px solid rgba(0,0,0,0.18)`
              if(d.outline === 'double') overlayStyle.border = `${Math.max(2, Math.round(4 * Math.min(scaleX, scaleY)))}px double rgba(255,255,255,0.8)`
              if(d.outline === 'glow') overlayStyle.boxShadow = `0 0 ${Math.max(6, Math.round(12 * Math.min(scaleX, scaleY)))}px rgba(255,255,255,0.6)`

              if(d.background && bgImage){
                // project only the portion of the background that covers this door
                // calculate where the door is positioned relative to the full calendar
                // then use backgroundPosition to shift the image so only the door's portion shows
                style.backgroundImage = `url(${bgImage})`
                // size the background to match the full calendar
                style.backgroundSize = `${effCalc.width}px ${effCalc.height}px`
                // position the background so the door sees only its portion
                // negative offsets shift the image to reveal the correct portion
                style.backgroundPosition = `-${left}px -${top}px`
                style.backgroundRepeat = 'no-repeat'
              }
              // door panel transform based on opening side
              let transformOrigin = 'center center'
              let closedTransform = 'none'
              let openTransform = 'none'
              const angle = 160
              const side = d.openingSide || 'right'
              switch(side){
                default:
                case 'right':
                  transformOrigin = 'right center'
                  openTransform = `rotateY(${angle}deg)`
                  closedTransform = 'none'
                  break
                case 'left':
                  transformOrigin = 'left center'
                  openTransform = `rotateY(-${angle}deg)`
                  closedTransform = 'none'
                  break
                case 'top':
                  transformOrigin = 'center top'
                  openTransform = `rotateX(-${angle}deg)`
                  closedTransform = 'none'
                  break
                case 'bottom':
                  transformOrigin = 'center bottom'
                  openTransform = `rotateX(${angle}deg)`
                  closedTransform = 'none'
                  break
              }

              const panelStyle = {position:'absolute', left:0, top:0, width:'100%', height:'100%', transformOrigin, transform: d.open ? openTransform : closedTransform}

              return (
                <div key={d.id}
                  className={`door ${openable? '':'locked'} ${d.open? 'open':''}`}
                  style={style}
                  onClick={()=>onClickDoor(d)}
                  onMouseDown={(e)=>onMouseDownDoor(e,d)}
                >
                  <div className="door-panel" style={panelStyle}>
                    <div className="door-front" style={{zIndex:1, width:'100%', height:'100%'}}>
                      <div style={{pointerEvents:'none'}}>{d.showNumber ? String(d.id) : (d.closedLabel || '')}</div>
                    </div>
                    <div className="door-back" style={{zIndex:0, width:'100%', height:'100%'}} />
                  </div>
                  <div className="door-overlay" style={overlayStyle} />
                </div>
              )
            })
          })()}
        </div>
        {/* modal popup for door content */}
        {modal.open && (
          <div className="door-modal-backdrop" onClick={closeModal}>
            <div className="door-modal" onClick={e=>e.stopPropagation()}>
              <button className="close" onClick={closeModal}>✕</button>
              <div>
                {typeof modal.content === 'string' && modal.content.trim().startsWith('<') ? (
                  <div dangerouslySetInnerHTML={{__html: modal.content}} />
                ) : (
                  <div>{modal.content}</div>
                )}
              </div>
            </div>
          </div>
        )}
        </div>

      {/* Sidebar for editing */}
      {editMode && (
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <button className="sidebar-toggle" onClick={()=>setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? '❯' : '❮'}
          </button>
          {!sidebarCollapsed && (
            <>
              <div style={{fontWeight:700,marginBottom:6,marginTop:25}}>Edit Mode — {globalName}</div>
              <div className="controls">
                <label>Calendar name</label>
                <input className="input" value={globalName} onChange={e=>setGlobalName(e.target.value)} />
                <label style={{marginTop:8}}><input type="checkbox" checked={preserveAspect} onChange={e=>setPreserveAspect(e.target.checked)} /> Preserve aspect when fullscreen</label>

                <label>Background image</label>
                <input type="file" accept="image/*" onChange={e=>{if(e.target.files[0]) onBgFile(e.target.files[0])}} />

                <label>Share code (read-only)</label>
                <input className="big-input" readOnly value={exportCode(false)} />

                <label>Edit-mode link</label>
                <input className="big-input" readOnly value={exportCode(true)} />

                <label>Import code</label>
                <input className="big-input" placeholder="paste code here" onKeyDown={e=>{if(e.key==='Enter'){handleImportCode(e.target.value,true)}}} />
              </div>

              {selected && (()=>{
                const d=doors.find(x=>x.id===selected); if(!d) return null
                return (
                  <div style={{marginTop:12}}>
                    <div style={{fontWeight:700, marginBottom:8}}>Door {d.id} settings</div>

                    <div style={{marginTop:8}}>
                      <label>Content</label>
                      <div><input style={{width:'100%'}} value={d.content} onChange={e=>updateDoor(d.id,{content:e.target.value})} /></div>
                    </div>

                    <div style={{marginTop:8}}>
                      <label>Closed label (shown when number hidden)</label>
                      <div><input style={{width:'100%'}} value={d.closedLabel} onChange={e=>updateDoor(d.id,{closedLabel:e.target.value})} /></div>
                    </div>

                    <div style={{marginTop:8}}>
                      <label>Show number on door</label>
                      <div><input type="checkbox" checked={!!d.showNumber} onChange={e=>updateDoor(d.id,{showNumber:e.target.checked})} /></div>
                    </div>

                <div style={{marginTop:8}}>
                  <label>Color</label>
                  <div><input type="color" value={d.color} onChange={e=>updateDoor(d.id,{color:e.target.value})} /></div>
                </div>

                <div style={{marginTop:8}}>
                  <label>Open date</label>
                  <div><input type="date" value={d.openingDate.slice(0,10)} onChange={e=>updateDoor(d.id,{openingDate:new Date(e.target.value).toISOString()})} /></div>
                </div>

                <div style={{marginTop:8}}>
                  <label>Border radius</label>
                  <div><input type="range" min="0" max="48" value={d.borderRadius} onChange={e=>updateDoor(d.id,{borderRadius:parseInt(e.target.value)})} /></div>
                </div>

                <div style={{marginTop:8}}>
                  <label>Size (width)</label>
                  <div><input type="number" min="20" max="1000" value={d.w} onChange={e=>updateDoor(d.id,{w:Math.max(20,parseInt(e.target.value)||20)})} /></div>
                </div>

                <div style={{marginTop:8}}>
                  <label>Size (height)</label>
                  <div><input type="number" min="20" max="1000" value={d.h} onChange={e=>updateDoor(d.id,{h:Math.max(20,parseInt(e.target.value)||20)})} /></div>
                </div>

                <div style={{marginTop:8}}>
                  <label>Outline</label>
                  <div>
                    <select value={d.outline} onChange={e=>updateDoor(d.id,{outline:e.target.value})}>
                      <option value="none">None</option>
                      <option value="thin">Thin</option>
                      <option value="thick">Thick</option>
                      <option value="double">Double</option>
                      <option value="glow">Glow</option>
                    </select>
                  </div>
                </div>

                <div style={{marginTop:8}}>
                  <label>Background projected</label>
                  <div><input type="checkbox" checked={d.background} onChange={e=>updateDoor(d.id,{background:e.target.checked})} /></div>
                </div>

                <div style={{marginTop:12}}>
                  <button onClick={()=>{setSelected(null)}}>Close</button>
                </div>
              </div>
            )
          })()}
            </>
          )}
        </aside>
      )}

      {/* Small floating share panel when viewing */}
      {!editMode && false && (
        <div className="toolbar-floating">
          <div style={{fontWeight:700}}>Viewing calendar</div>
          <div style={{marginTop:6}}>Share code:</div>
          <input readOnly value={exportCode(false)} />
        </div>
      )}
    </div>
  )
}
