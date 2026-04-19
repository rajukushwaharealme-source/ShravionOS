import React, { useState, useRef, useEffect, useCallback } from 'react';
import { format, isSameDay, startOfDay, addMinutes, differenceInMinutes, parseISO } from 'date-fns';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Plus, X, GripVertical, Check, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface TimeBlock {
  id: string;
  title: string;
  goalId?: string;
  startTime: any;
  endTime: any;
  color?: string;
  status?: string;
}

interface TimelineViewProps {
  date: Date;
  blocks: TimeBlock[];
  goals: any[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_HEIGHT = 1.5; // px per minute

export const TimelineView: React.FC<TimelineViewProps> = ({ date, blocks, goals }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [editingBlock, setEditingBlock] = useState<Partial<TimeBlock> | null>(null);
  const [activeDateBlocks, setActiveDateBlocks] = useState<TimeBlock[]>([]);
  
  const [draggingBlock, setDraggingBlock] = useState<{ id: string, initialTop: number, initialY: number, action: 'move' | 'resize' } | null>(null);

  useEffect(() => {
    // Filter blocks for the selected date
    const filtered = blocks.filter(b => {
      if (!b.startTime) return false;
      const d = b.startTime.toDate ? b.startTime.toDate() : new Date(b.startTime);
      return isSameDay(d, date);
    });
    setActiveDateBlocks(filtered);
  }, [blocks, date]);

  // Handle clicking on the timeline to create a new block
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || editingBlock || draggingBlock) return;
    
    // Check if clicked exactly on the background, not on an existing block
    if ((e.target as HTMLElement).closest('.time-block')) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    
    // Calculate time based on y position
    const totalMinutesClick = Math.floor(y / MINUTE_HEIGHT);
    // Snap to 15-minute intervals
    const snappedMinutes = Math.floor(totalMinutesClick / 15) * 15;
    
    const start = addMinutes(startOfDay(date), snappedMinutes);
    const end = addMinutes(start, 60); // Default 1 hour duration
    
    setEditingBlock({
      title: '',
      startTime: start,
      endTime: end,
      color: 'blue'
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, blockId: string, action: 'move' | 'resize') => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!containerRef.current) return;
    const block = activeDateBlocks.find(b => b.id === blockId);
    if (!block) return;

    const startD = block.startTime?.toDate ? block.startTime.toDate() : new Date(block.startTime);
    const initialTop = differenceInMinutes(startD, startOfDay(date)) * MINUTE_HEIGHT;

    setDraggingBlock({
        id: blockId,
        initialTop,
        initialY: e.clientY,
        action
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingBlock || !containerRef.current) return;
    
    const deltaY = e.clientY - draggingBlock.initialY;
    const deltaMinutes = Math.round(deltaY / MINUTE_HEIGHT / 15) * 15; // snap to 15 min

    if (deltaMinutes === 0 && draggingBlock.action !== 'move') return;

    const updatedBlocks = [...activeDateBlocks];
    const index = updatedBlocks.findIndex(b => b.id === draggingBlock.id);
    if (index === -1) return;
    
    const block = {...updatedBlocks[index]};
    const currentStart = block.startTime?.toDate ? block.startTime.toDate() : new Date(block.startTime);
    const currentEnd = block.endTime?.toDate ? block.endTime.toDate() : new Date(block.endTime);
    const origDuration = differenceInMinutes(currentEnd, currentStart);

    if (draggingBlock.action === 'move') {
       // Only move if it hasn't actually triggered an update jump yet to avoid drift
       // Usually it's better to calculate based on absolute offset
       const newTop = Math.max(0, draggingBlock.initialTop + deltaY);
       const newStartMins = Math.round(newTop / MINUTE_HEIGHT / 15) * 15;
       const newStart = addMinutes(startOfDay(date), newStartMins);
       const newEnd = addMinutes(newStart, origDuration);
       
       block.startTime = newStart;
       block.endTime = newEnd;
    } else { // resize
       const newEndMins = differenceInMinutes(currentEnd, startOfDay(date)) + deltaMinutes;
       const newEndNum = Math.max(differenceInMinutes(currentStart, startOfDay(date)) + 15, newEndMins); // min 15 mins
       block.endTime = addMinutes(startOfDay(date), newEndNum);
       // Reset initialY so delta behaves per-tick
       setDraggingBlock({...draggingBlock, initialY: e.clientY});
    }

    updatedBlocks[index] = block;
    setActiveDateBlocks(updatedBlocks);
  };

  const handlePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingBlock) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const block = activeDateBlocks.find(b => b.id === draggingBlock.id);
    setDraggingBlock(null);
    if (!block) return;
    
    // Save to firebase
    try {
        await updateDoc(doc(db, 'pomodoroSessions', block.id), {
            startTime: block.startTime,
            endTime: block.endTime
        });
    } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `pomodoroSessions`);
    }
  };

  const saveBlock = async () => {
    if (!user || !editingBlock || !editingBlock.title) return;
    
    try {
      if (editingBlock.id) {
        // Update
        await updateDoc(doc(db, 'pomodoroSessions', editingBlock.id), {
          title: editingBlock.title,
          goalId: editingBlock.goalId || null,
          startTime: editingBlock.startTime,
          endTime: editingBlock.endTime,
          color: editingBlock.color || 'blue',
          status: editingBlock.status || 'planned'
        });
      } else {
        // Create
        await addDoc(collection(db, 'pomodoroSessions'), {
          uid: user.uid,
          title: editingBlock.title,
          goalId: editingBlock.goalId || null,
          startTime: editingBlock.startTime,
          endTime: editingBlock.endTime,
          color: editingBlock.color || 'blue',
          status: 'planned',
          createdAt: serverTimestamp(),
          // Required by rules:
          isTimeBlock: true,
          durationSeconds: 0,
          sessionType: 'free'
        });
      }
      setEditingBlock(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'pomodoroSessions');
    }
  };

  const deleteBlock = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'pomodoroSessions', id));
      if (editingBlock?.id === id) setEditingBlock(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `pomodoroSessions/${id}`);
    }
  };

  const getDayStart = startOfDay(date);

  const calculateTop = (time: Date) => {
    const d = new Date(time);
    return differenceInMinutes(d, getDayStart) * MINUTE_HEIGHT;
  };

  const calculateHeight = (start: Date, end: Date) => {
    return differenceInMinutes(new Date(end), new Date(start)) * MINUTE_HEIGHT;
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
  };

  const getColors = (colorName?: string) => {
    const map: any = {
      blue: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200 border-blue-200 dark:border-blue-500/30',
      green: 'bg-green-100 text-green-800 dark:bg-emerald-500/20 dark:text-emerald-200 border-green-200 dark:border-emerald-500/30',
      purple: 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-200 border-purple-200 dark:border-purple-500/30',
      orange: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200 border-orange-200 dark:border-orange-500/30',
      rose: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200 border-rose-200 dark:border-rose-500/30',
    };
    return map[colorName || 'blue'];
  };

  const activeGoals = goals.filter(g => g.status !== 'completed' && g.status !== 'missed');

  return (
    <div className="flex gap-4 min-h-[800px] mt-6 bg-white dark:bg-slate-900 rounded-[2rem] p-6 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300 relative overflow-hidden">
      
      {/* Settings / Edit Panel */}
      <AnimatePresence>
        {editingBlock && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute right-6 top-6 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 p-5 z-30 flex flex-col gap-4 transition-colors"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">
                {editingBlock.id ? 'Edit Block' : 'New Block'}
              </h3>
              <button onClick={() => setEditingBlock(null)} className="text-gray-400 hover:text-gray-900 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Title</label>
              <input 
                type="text" 
                value={editingBlock.title}
                onChange={e => setEditingBlock({...editingBlock, title: e.target.value})}
                placeholder="What will you do?"
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 outline-none focus:border-blue-500 dark:text-white transition-colors"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Start Time</label>
                <input 
                  type="time" 
                  value={format(editingBlock.startTime || new Date(), 'HH:mm')}
                  onChange={e => {
                    const [hours, mins] = e.target.value.split(':');
                    const newStart = new Date(editingBlock.startTime);
                    newStart.setHours(parseInt(hours, 10), parseInt(mins, 10), 0, 0);
                    setEditingBlock({...editingBlock, startTime: newStart});
                  }}
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 outline-none focus:border-blue-500 dark:text-white transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">End Time</label>
                <input 
                  type="time" 
                  value={format(editingBlock.endTime || new Date(), 'HH:mm')}
                  onChange={e => {
                    const [hours, mins] = e.target.value.split(':');
                    const newEnd = new Date(editingBlock.startTime); // keep same day as start
                    newEnd.setHours(parseInt(hours, 10), parseInt(mins, 10), 0, 0);
                    // Ensure end is strictly after start
                    if (newEnd <= editingBlock.startTime!) {
                      newEnd.setDate(newEnd.getDate() + 1);
                    }
                    setEditingBlock({...editingBlock, endTime: newEnd});
                  }}
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 outline-none focus:border-blue-500 dark:text-white transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Link Goal (Optional)</label>
              <select
                value={editingBlock.goalId || ''}
                onChange={e => setEditingBlock({...editingBlock, goalId: e.target.value})}
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 outline-none focus:border-blue-500 dark:text-white transition-colors"
              >
                <option value="">None</option>
                {activeGoals.map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Color</label>
              <div className="flex gap-2">
                {['blue', 'green', 'purple', 'orange', 'rose'].map(color => (
                  <button
                    key={color}
                    onClick={() => setEditingBlock({...editingBlock, color})}
                    className={cn(
                      "w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110",
                      color === 'blue' && "bg-blue-500",
                      color === 'green' && "bg-emerald-500",
                      color === 'purple' && "bg-purple-500",
                      color === 'orange' && "bg-orange-500",
                      color === 'rose' && "bg-rose-500",
                      editingBlock.color === color ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-slate-900 box-content border-2 border-white dark:border-slate-800" : ""
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button 
                onClick={saveBlock}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-xl transition-colors"
              >
                Save
              </button>
              {editingBlock.id && (
                <button 
                  onClick={() => deleteBlock(editingBlock.id!)}
                  className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-400 font-bold py-2 rounded-xl transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-16 flex flex-col pt-2 shrink-0 border-r border-gray-100 dark:border-white/5 relative z-10">
        {HOURS.map(hour => (
          <div key={hour} className="relative text-xs text-gray-400 dark:text-gray-500 font-medium font-mono text-right pr-4" style={{ height: 60 * MINUTE_HEIGHT }}>
            <span className="relative -top-2">{formatHour(hour)}</span>
          </div>
        ))}
      </div>

      <div 
        ref={containerRef}
        className="flex-1 relative cursor-crosshair group overflow-hidden" 
        style={{ height: 24 * 60 * MINUTE_HEIGHT, marginTop: '8px', touchAction: 'none' }}
        onClick={handleTimelineClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Grid lines */}
        {HOURS.map(hour => (
          <div 
            key={hour} 
            className="absolute w-full border-t border-gray-100 dark:border-white/5 pointer-events-none"
            style={{ top: hour * 60 * MINUTE_HEIGHT }}
          />
        ))}

        {/* Current Time Indicator */}
        {isSameDay(date, new Date()) && (
          <div 
            className="absolute w-full border-t-2 border-red-500 dark:border-red-400 z-20 flex items-center pointer-events-none shadow-[0_0_10px_rgba(239,68,68,0.5)]"
            style={{ top: calculateTop(new Date()) }}
          >
            <div className="w-2 h-2 rounded-full bg-red-500 dark:bg-red-400 absolute -left-1 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
          </div>
        )}

        {/* Blocks */}
        {activeDateBlocks.map(block => {
          const top = calculateTop(block.startTime?.toDate ? block.startTime.toDate() : new Date(block.startTime));
          const height = calculateHeight(
            block.startTime?.toDate ? block.startTime.toDate() : new Date(block.startTime), 
            block.endTime?.toDate ? block.endTime.toDate() : new Date(block.endTime)
          );
          
          return (
            <motion.div
              layoutId={block.id}
              key={block.id}
              onClick={(e) => {
                e.stopPropagation();
                if (draggingBlock) return;
                if (block.startTime?.toDate) {
                    setEditingBlock({
                        ...block,
                        startTime: block.startTime.toDate(),
                        endTime: block.endTime.toDate()
                    });
                } else {
                    setEditingBlock(block); // Assume it's already serialised dates if no .toDate
                }
              }}
              onPointerDown={(e) => handlePointerDown(e, block.id, 'move')}
              className={cn(
                "absolute left-2 right-4 rounded-xl border p-2 text-sm flex flex-col justify-between cursor-grab active:cursor-grabbing time-block transition-shadow hover:shadow-md dark:hover:shadow-lg z-10",
                getColors(block.color),
                editingBlock?.id === block.id && "ring-2 ring-gray-900 dark:ring-white z-20",
                draggingBlock?.id === block.id && "z-30 opacity-90 shadow-xl"
              )}
              style={{ top, height: Math.max(height, 20) }}
            >
              <div className="overflow-hidden pointer-events-none">
                <div className="font-bold truncate opacity-90">{block.title}</div>
                {height >= 40 && (
                  <div className="text-xs opacity-75 font-medium mt-0.5 pointer-events-none">
                    {format(block.startTime?.toDate ? block.startTime.toDate() : new Date(block.startTime), 'HH:mm')} - {format(block.endTime?.toDate ? block.endTime.toDate() : new Date(block.endTime), 'HH:mm')}
                  </div>
                )}
              </div>
              
              {/* If height is large enough, show tools */}
              {height >= 60 && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-current border-opacity-20 pointer-events-none">
                   <button 
                     onPointerDown={(e) => e.stopPropagation()}
                     onClick={(e) => {
                        e.stopPropagation();
                        // Start timer logic
                        navigate('/focus', { state: { goalId: block.goalId, mode: block.goalId ? 'goal' : 'focus' } });
                     }}
                     className="bg-white/20 hover:bg-white/30 dark:bg-black/20 dark:hover:bg-black/40 p-1.5 rounded-lg transition-colors flex items-center justify-center backdrop-blur-sm pointer-events-auto"
                     title="Start Timer"
                   >
                     <Play className="w-3.5 h-3.5" />
                   </button>
                   {block.goalId && <span className="text-[10px] uppercase font-bold opacity-70 tracking-wider">Linked</span>}
                </div>
              )}

              {/* Resize Handle */}
              <div 
                className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize flex items-center justify-center opcatiy-50 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 rounded-b-xl"
                onPointerDown={(e) => handlePointerDown(e, block.id, 'resize')}
              >
                <div className="w-8 h-1 bg-current opacity-30 rounded-full" />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
