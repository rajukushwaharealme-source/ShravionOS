import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Plus, Folder, Target, ListChecks, ArrowLeft, Edit2, Trash2, X, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

type EntityType = 'category' | 'goal' | 'subtask';
type EditingItem = { id: string; type: EntityType; name: string; categoryId?: string; goalId?: string } | null;
type DeleteTarget = { id: string; type: EntityType; categoryId?: string; goalId?: string } | null;

export const Organization = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<EditingItem>(null);
  const [newItemName, setNewItemName] = useState('');
  const [addingType, setAddingType] = useState<EntityType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DeleteTarget>(null);

  useEffect(() => {
    if (!user) return;

    const unsubCategories = onSnapshot(query(collection(db, 'categories'), where('uid', '==', user.uid)), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => a.name.localeCompare(b.name)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'categories'));

    const unsubGoals = onSnapshot(query(collection(db, 'goals'), where('uid', '==', user.uid)), (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => a.title.localeCompare(b.title)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'goals'));

    return () => {
      unsubCategories();
      unsubGoals();
    };
  }, [user]);

  const selectedGoalData = goals.find(goal => goal.id === selectedGoal);
  const filteredGoals = selectedCategory ? goals.filter(goal => goal.categoryId === selectedCategory) : [];
  const selectedSubTasks = Array.isArray(selectedGoalData?.subTasks) ? selectedGoalData.subTasks : [];

  const handleAdd = async (type: EntityType) => {
    if (!user || !newItemName.trim()) return;

    try {
      if (type === 'category') {
        await addDoc(collection(db, 'categories'), {
          uid: user.uid,
          name: newItemName.trim(),
          color: '#3B82F6',
          icon: 'folder',
          createdAt: serverTimestamp()
        });
      }

      if (type === 'goal') {
        if (!selectedCategory) return;
        await addDoc(collection(db, 'goals'), {
          uid: user.uid,
          title: newItemName.trim(),
          categoryId: selectedCategory,
          priority: 'medium',
          status: 'pending',
          type: 'one-time',
          progressType: 'checkbox',
          createdAt: serverTimestamp()
        });
      }

      if (type === 'subtask') {
        if (!selectedGoalData) return;
        const nextSubTask = {
          id: crypto.randomUUID(),
          title: newItemName.trim(),
          completed: false
        };

        await updateDoc(doc(db, 'goals', selectedGoalData.id), {
          subTasks: [...selectedSubTasks, nextSubTask]
        });
      }

      setNewItemName('');
      setAddingType(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, type);
    }
  };

  const handleUpdate = async () => {
    if (!editingItem || !editingItem.name.trim()) return;

    try {
      if (editingItem.type === 'category') {
        await updateDoc(doc(db, 'categories', editingItem.id), {
          name: editingItem.name.trim()
        });
      }

      if (editingItem.type === 'goal') {
        await updateDoc(doc(db, 'goals', editingItem.id), {
          title: editingItem.name.trim()
        });
      }

      if (editingItem.type === 'subtask') {
        const goal = goals.find(item => item.id === editingItem.goalId);
        if (!goal) return;
        const subTasks = Array.isArray(goal.subTasks) ? goal.subTasks : [];

        await updateDoc(doc(db, 'goals', goal.id), {
          subTasks: subTasks.map((item: any) => item.id === editingItem.id ? { ...item, title: editingItem.name.trim() } : item)
        });
      }

      setEditingItem(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, editingItem.type);
    }
  };

  const handleDelete = async (id: string, type: EntityType, goalId?: string) => {
    try {
      if (type === 'category') {
        await deleteDoc(doc(db, 'categories', id));
        if (selectedCategory === id) {
          setSelectedCategory(null);
          setSelectedGoal(null);
        }
      }

      if (type === 'goal') {
        await deleteDoc(doc(db, 'goals', id));
        if (selectedGoal === id) setSelectedGoal(null);
      }

      if (type === 'subtask') {
        const goal = goals.find(item => item.id === goalId);
        if (!goal) return;
        const subTasks = Array.isArray(goal.subTasks) ? goal.subTasks : [];

        await updateDoc(doc(db, 'goals', goal.id), {
          subTasks: subTasks.filter((item: any) => item.id !== id)
        });
      }

      setConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, type);
    }
  };

  const renderList = (
    items: any[],
    type: EntityType,
    selectedId: string | null,
    onSelect: (id: string) => void,
    icon: React.ElementType,
    parentSelected = true
  ) => {
    if (!parentSelected) return null;

    const Icon = icon;
    const title = type === 'category' ? 'Categories' : type === 'goal' ? 'Goals' : 'Subtasks';
    const emptyLabel = type === 'category' ? 'category' : type === 'goal' ? 'goal' : 'subtask';

    return (
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">{title}</h3>
          <button
            onClick={() => { setAddingType(type); setNewItemName(''); }}
            className="p-1.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {items.map(item => {
            const itemId = item.id;
            const itemName = type === 'goal' ? item.title : item.name || item.title;

            return (
              <div
                key={itemId}
                className={cn(
                  "group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                  selectedId === itemId
                    ? "bg-gray-900 border-gray-900 dark:bg-blue-600 dark:border-blue-600 text-white shadow-md"
                    : "bg-white dark:bg-slate-900 border-gray-100 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 text-gray-700 dark:text-gray-200"
                )}
                onClick={() => onSelect(itemId)}
              >
                {editingItem?.id === itemId && editingItem.type === type ? (
                  <div className="flex items-center gap-2 w-full" onClick={event => event.stopPropagation()}>
                    <input
                      autoFocus
                      type="text"
                      value={editingItem.name}
                      onChange={event => setEditingItem({ ...editingItem, name: event.target.value })}
                      onKeyDown={event => event.key === 'Enter' && handleUpdate()}
                      className="flex-1 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 outline-none px-1 py-0.5 text-gray-900 dark:text-white"
                    />
                    <button onClick={handleUpdate} className="p-1 text-green-600 hover:bg-green-50 dark:text-emerald-400 dark:hover:bg-emerald-500/20 rounded"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingItem(null)} className="p-1 text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 rounded"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0",
                        selectedId === itemId ? "bg-white/20" : "bg-gray-50 dark:bg-slate-800"
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium truncate block">{itemName}</span>
                        {type === 'goal' && (
                          <span className="text-[10px] uppercase tracking-wider opacity-60">{(item.subTasks || []).length} subtasks</span>
                        )}
                        {type === 'subtask' && item.completed && (
                          <span className="text-[10px] uppercase tracking-wider opacity-60">Completed</span>
                        )}
                      </div>
                    </div>
                    <div className={cn(
                      "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                      selectedId === itemId ? "text-white/80" : "text-gray-400"
                    )}>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingItem({ id: itemId, type, name: itemName, categoryId: selectedCategory || undefined, goalId: type === 'subtask' ? selectedGoal || undefined : undefined });
                        }}
                        className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirmDelete({ id: itemId, type, categoryId: selectedCategory || undefined, goalId: type === 'subtask' ? selectedGoal || undefined : undefined });
                        }}
                        className="p-1.5 hover:bg-red-500/20 hover:text-red-500 rounded-md transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {type !== 'subtask' && <ChevronRight className="w-4 h-4 ml-1" />}
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {addingType === type && (
            <div className="flex items-center gap-2 p-3 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/50 rounded-xl shadow-sm">
              <input
                autoFocus
                type="text"
                placeholder={`New ${emptyLabel} name...`}
                value={newItemName}
                onChange={event => setNewItemName(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && handleAdd(type)}
                className="flex-1 outline-none bg-transparent text-sm dark:text-white"
              />
              <button onClick={() => handleAdd(type)} className="p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded transition-colors"><Check className="w-4 h-4" /></button>
              <button onClick={() => setAddingType(null)} className="p-1 text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 rounded transition-colors"><X className="w-4 h-4" /></button>
            </div>
          )}

          {items.length === 0 && addingType !== type && (
            <div
              onClick={() => { setAddingType(type); setNewItemName(''); }}
              className="p-4 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-xl text-center text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-700 transition-colors"
            >
              + Add {emptyLabel}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-24 md:pb-8 transition-colors duration-300">
      <div className="bg-white/90 dark:bg-[#0B1220]/90 backdrop-blur-xl px-6 md:px-8 lg:px-10 pt-12 md:pt-8 pb-6 sticky top-0 z-30 border-b border-gray-100 dark:border-white/5 max-w-7xl mx-auto transition-colors duration-300">
        <div className="flex items-center gap-4 mb-2">
          <Link to="/goals" className="p-2 -ml-2 bg-gray-50 dark:bg-slate-900 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-display font-bold text-gray-900 dark:text-white">Structure</h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Manage your categories, goals, and subtasks.</p>
      </div>

      <div className="p-6 md:p-8 lg:p-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <div>
            {renderList(categories, 'category', selectedCategory, (id) => { setSelectedCategory(id); setSelectedGoal(null); }, Folder)}
          </div>

          <AnimatePresence mode="popLayout">
            {selectedCategory && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full">
                {renderList(filteredGoals, 'goal', selectedGoal, (id) => setSelectedGoal(id), Target, Boolean(selectedCategory))}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="popLayout">
            {selectedGoal && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full">
                {renderList(selectedSubTasks, 'subtask', null, () => {}, ListChecks, Boolean(selectedGoal))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 dark:border-white/10"
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Delete {confirmDelete.type}?</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Are you sure you want to delete this {confirmDelete.type}? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-sm font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-95 transition-transform"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(confirmDelete.id, confirmDelete.type, confirmDelete.goalId)}
                  className="flex-1 py-2.5 bg-red-600 dark:bg-rose-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-200 dark:shadow-none hover:bg-red-700 dark:hover:bg-rose-700 active:scale-95 transition-transform"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
