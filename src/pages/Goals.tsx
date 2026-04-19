import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, deleteField, setDoc, Timestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Plus, CheckCircle2, Circle, Folder, Target, X, Search, MoreVertical, Edit2, Trash2, ChevronDown, ChevronUp, Clock, Play } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { withGoalDisplayStatus } from '../lib/goal-status';
import {
  FOCUS_SESSIONS_UPDATED_EVENT,
  getFocusSessionSeconds,
  mergeFocusSessionsWithCache,
  roundFocusSecondsToMinutes
} from '../lib/focus-session-cache';
import { motion, AnimatePresence } from 'motion/react';

const ALLOWED_GOAL_TYPES = ['daily', 'weekly', 'monthly', 'one-time'];
const ALLOWED_PROGRESS_TYPES = ['checkbox', 'percentage', 'duration'];

const toOptimisticTimestamp = (value: Date | null) => {
  return value ? Timestamp.fromDate(value) : undefined;
};

const getStatusLabel = (status: string) => {
  if (status === 'in-progress') return 'In Progress';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

type SubTask = {
  id: string;
  title: string;
  completed: boolean;
  startDate?: string;
  deadline?: string;
  priority?: 'low' | 'medium' | 'high' | '';
  actualTime?: number;
  focusSeconds?: number;
};

export const Goals = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState<any[]>([]);
  const [focusSessions, setFocusSessions] = useState<any[]>([]);
  const [statusClock, setStatusClock] = useState(new Date());
  const [categories, setCategories] = useState<any[]>([]);
  const [subjectsList, setSubjectsList] = useState<any[]>([]);
  const [topicsList, setTopicsList] = useState<any[]>([]);
  const [conceptsList, setConceptsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'completed', 'high'
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Modals State
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any>(null);
  
  // Goal Form State
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalCategory, setNewGoalCategory] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [inlineCategoryName, setInlineCategoryName] = useState('');
  const [goalStartDate, setGoalStartDate] = useState('');
  const [goalEndDate, setGoalEndDate] = useState('');
  const [newGoalPriority, setNewGoalPriority] = useState('medium');
  
  // Optional Fields State
  const [showOptional, setShowOptional] = useState(false);
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [concept, setConcept] = useState('');
  const [goalType, setGoalType] = useState('daily'); // daily, weekly, monthly, one-time
  const [goalStatus, setGoalStatus] = useState('pending'); // pending, in-progress, completed, missed
  const [progressType, setProgressType] = useState('checkbox'); // checkbox, percentage, duration
  const [targetValue, setTargetValue] = useState('');
  const [completedValue, setCompletedValue] = useState('');
  const [repeatSchedule, setRepeatSchedule] = useState('');
  const [notes, setNotes] = useState('');
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [newSubTaskTitle, setNewSubTaskTitle] = useState('');

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Validation & Feedback State
  const [errors, setErrors] = useState<{title?: string, category?: string, date?: string}>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Action Menu State
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => setStatusClock(new Date()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!user) return;

    const qCategories = query(collection(db, 'categories'), where('uid', '==', user.uid));
    const unsubCategories = onSnapshot(qCategories, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(cats);
      
      // Derive subjects, topics, concepts from categories
      const allSubjects = cats.flatMap((c: any) => (c.subjects || []).map((s: any) => ({ ...s, categoryId: c.id })));
      const allTopics = cats.flatMap((c: any) => (c.topics || []).map((t: any) => ({ ...t, categoryId: c.id })));
      const allConcepts = cats.flatMap((c: any) => (c.concepts || []).map((co: any) => ({ ...co, categoryId: c.id })));
      
      setSubjectsList(allSubjects);
      setTopicsList(allTopics);
      setConceptsList(allConcepts);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'categories'));

    const qGoals = query(collection(db, 'goals'), where('uid', '==', user.uid));
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      const fetchedGoals = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return { 
          id: doc.id, 
          ...data
        };
      });
      setGoals(fetchedGoals);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'goals'));

    const qSessions = query(collection(db, 'pomodoroSessions'), where('uid', '==', user.uid));
    const unsubSessions = onSnapshot(qSessions, (snapshot) => {
      const sessions = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((session: any) => !session.isTimeBlock);
      setFocusSessions(mergeFocusSessionsWithCache(sessions));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pomodoroSessions'));

    return () => {
      unsubCategories();
      unsubGoals();
      unsubSessions();
    };
  }, [user]);

  useEffect(() => {
    const refreshCachedSessions = () => setFocusSessions(prev => mergeFocusSessionsWithCache(prev));
    window.addEventListener(FOCUS_SESSIONS_UPDATED_EVENT, refreshCachedSessions);
    window.addEventListener('storage', refreshCachedSessions);
    return () => {
      window.removeEventListener(FOCUS_SESSIONS_UPDATED_EVENT, refreshCachedSessions);
      window.removeEventListener('storage', refreshCachedSessions);
    };
  }, []);

  const displayedGoals = useMemo(() => {
    return goals.map(goal => withGoalDisplayStatus(goal, statusClock)).sort((a, b) => {
      if (!a.deadline || !b.deadline) return 0;
      return a.deadline.toDate().getTime() - b.deadline.toDate().getTime();
    });
  }, [goals, statusClock]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const calculateSubTaskPercentage = (tasks: any[] = []) => {
    if (tasks.length === 0) return 0;
    const completedCount = tasks.filter(st => st.completed).length;
    return Math.round((completedCount / tasks.length) * 100);
  };

  const normalizeGoalType = (value?: string) => ALLOWED_GOAL_TYPES.includes(value || '') ? value! : 'one-time';
  const normalizeProgressType = (value?: string) => ALLOWED_PROGRESS_TYPES.includes(value || '') ? value! : 'checkbox';
  const getSessionMinutesForGoal = (goalId: string) => {
    const seconds = focusSessions.reduce((acc, session) => {
      return session.goalId === goalId ? acc + getFocusSessionSeconds(session) : acc;
    }, 0);
    return roundFocusSecondsToMinutes(seconds);
  };
  const getSessionMinutesForSubTask = (subTaskId: string) => {
    const seconds = focusSessions.reduce((acc, session) => {
      return session.subTaskId === subTaskId ? acc + getFocusSessionSeconds(session) : acc;
    }, 0);
    return roundFocusSecondsToMinutes(seconds);
  };
  const getStoredSubTaskMinutes = (subTask: any) => Math.max(
    Number(subTask.actualTime) || 0,
    roundFocusSecondsToMinutes(Number(subTask.focusSeconds) || 0)
  );
  const getSubTaskWorkedMinutes = (subTask: any) => Math.max(getStoredSubTaskMinutes(subTask), getSessionMinutesForSubTask(subTask.id));
  const getGoalWorkedMinutes = (goal: any) => {
    const subTaskMinutes = Array.isArray(goal.subTasks)
      ? goal.subTasks.reduce((total: number, subTask: any) => total + getSubTaskWorkedMinutes(subTask), 0)
      : 0;

    return Math.max(Number(goal.actualTime) || 0, getSessionMinutesForGoal(goal.id), subTaskMinutes);
  };
  const formatSubTaskDateInput = (value: any) => {
    if (!value) return '';
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : format(date, "yyyy-MM-dd'T'HH:mm");
  };
  const formatDateLabel = (value: any) => {
    if (!value) return '';
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : format(date, 'dd-MM-yy');
  };
  const renderDateBadges = (startDate: any, endDate: any) => {
    const startLabel = formatDateLabel(startDate);
    const endLabel = formatDateLabel(endDate);
    if (!startLabel && !endLabel) return null;

    return (
      <span className="inline-flex items-center gap-1.5 shrink-0">
        {startLabel && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {startLabel}
          </span>
        )}
        {startLabel && endLabel && <span className="text-[10px] text-gray-300 dark:text-gray-600">-</span>}
        {endLabel && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
            {endLabel}
          </span>
        )}
      </span>
    );
  };

  const normalizeSubTasksForForm = (tasks: any[] = []): SubTask[] => tasks.map(st => ({
    id: st.id || crypto.randomUUID(),
    title: st.title || '',
    completed: Boolean(st.completed),
    startDate: formatSubTaskDateInput(st.startDate),
    deadline: formatSubTaskDateInput(st.deadline),
    priority: ['low', 'medium', 'high'].includes(st.priority) ? st.priority : '',
    actualTime: Number(st.actualTime) || 0,
    focusSeconds: Number(st.focusSeconds) || 0
  }));

  const normalizeSubTasksForSave = (tasks: SubTask[]) => tasks.map(st => {
    const data: any = {
      id: st.id,
      title: st.title.trim(),
      completed: Boolean(st.completed)
    };
    if (st.startDate) data.startDate = new Date(st.startDate).toISOString();
    if (st.deadline) data.deadline = new Date(st.deadline).toISOString();
    if (st.priority) data.priority = st.priority;
    if (Number(st.actualTime) > 0) data.actualTime = Number(st.actualTime);
    if (Number(st.focusSeconds) > 0) data.focusSeconds = Number(st.focusSeconds);
    return data;
  });

  const updateSubTask = (id: string, patch: Partial<SubTask>) => {
    setSubTasks(prev => prev.map(st => st.id === id ? { ...st, ...patch } : st));
  };

  const handleSubTaskStartChange = (id: string, nextStart: string) => {
    setSubTasks(prev => prev.map(st => {
      if (st.id !== id) return st;
      const nextDeadline = st.deadline && nextStart && new Date(st.deadline).getTime() < new Date(nextStart).getTime()
        ? ''
        : st.deadline;
      return { ...st, startDate: nextStart, deadline: nextDeadline };
    }));
    if (errors.date) setErrors({ ...errors, date: undefined });
  };

  const handleSubTaskEndChange = (id: string, nextDeadline: string) => {
    setSubTasks(prev => prev.map(st => {
      if (st.id !== id) return st;
      if (st.startDate && nextDeadline && new Date(nextDeadline).getTime() < new Date(st.startDate).getTime()) {
        return { ...st, deadline: '' };
      }
      return { ...st, deadline: nextDeadline };
    }));
    if (errors.date) setErrors({ ...errors, date: undefined });
  };

  const getDurationTargetMinutes = (goal: any) => Number(goal.targetValue || goal.estimatedTime || 0);
  const getDurationActualMinutes = (goal: any) => Math.max(Number(goal.completedValue) || 0, getGoalWorkedMinutes(goal));
  const getRemainingDurationMinutes = (goal: any) => {
    const target = getDurationTargetMinutes(goal);
    const actual = getDurationActualMinutes(goal);
    return Math.max(0, Math.ceil(target - actual));
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newCategoryName.trim()) return;

    try {
      await addDoc(collection(db, 'categories'), {
        uid: user.uid,
        name: newCategoryName.trim(),
        color: '#3B82F6',
        icon: 'folder',
        createdAt: serverTimestamp()
      });
      setNewCategoryName('');
      setShowAddCategory(false);
      showToast('Category created');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
    }
  };

  const resetGoalForm = () => {
    setEditingGoal(null);
    setNewGoalTitle('');
    setNewGoalCategory('');
    setShowCategoryDropdown(false);
    setIsCreatingCategory(false);
    setInlineCategoryName('');
    setGoalStartDate('');
    setGoalEndDate('');
    setNewGoalPriority('medium');
    setShowOptional(false);
    setSubject('');
    setTopic('');
    setConcept('');
    setGoalType('daily');
    setGoalStatus('pending');
    setProgressType('checkbox');
    setTargetValue('');
    setCompletedValue('');
    setRepeatSchedule('');
    setNotes('');
    setSubTasks([]);
    setNewSubTaskTitle('');
    setErrors({});
    setShowAddGoal(false);
  };

  const openEditGoal = (goal: any) => {
    setEditingGoal(goal);
    setNewGoalTitle(goal.title);
    setNewGoalCategory(goal.categoryId);
    setShowCategoryDropdown(false);
    setIsCreatingCategory(false);
    setInlineCategoryName('');
    
    if (goal.startDate) {
      setGoalStartDate(format(goal.startDate.toDate(), "yyyy-MM-dd'T'HH:mm"));
    } else {
      setGoalStartDate('');
    }
    
    if (goal.deadline) {
      setGoalEndDate(format(goal.deadline.toDate(), "yyyy-MM-dd'T'HH:mm"));
    } else {
      setGoalEndDate('');
    }

    setNewGoalPriority(goal.priority || 'medium');
    const normalizedGoalType = normalizeGoalType(goal.type);
    const normalizedProgressType = normalizeProgressType(goal.progressType);

    setGoalType(normalizedGoalType);
    setGoalStatus(goal.status || 'pending');
    setProgressType(normalizedProgressType);
    setTargetValue(goal.targetValue ? goal.targetValue.toString() : '');
    setCompletedValue(goal.completedValue ? goal.completedValue.toString() : '');
    setSubject(goal.subjectId || '');
    setTopic(goal.topicId || '');
    setConcept(goal.conceptId || '');
    setRepeatSchedule(goal.repeatSchedule || '');
    setNotes(goal.notes || '');
    setSubTasks(normalizeSubTasksForForm(goal.subTasks || []));
    setNewSubTaskTitle('');
    
    if ((goal.subTasks && goal.subTasks.length > 0) || goal.subjectId || goal.topicId || goal.conceptId || normalizedGoalType !== 'daily' || goal.notes || normalizedProgressType !== 'checkbox' || goal.repeatSchedule) {
      setShowOptional(true);
    } else {
      setShowOptional(false);
    }

    setActiveMenu(null);
    setShowAddGoal(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validation
    const newErrors: any = {};
    if (!newGoalTitle.trim()) newErrors.title = 'Title is required';
    if (!isCreatingCategory && !newGoalCategory) newErrors.category = 'Category is required';
    if (isCreatingCategory && !inlineCategoryName.trim()) newErrors.category = 'Category name is required';
    if (goalStartDate && goalEndDate && new Date(goalEndDate).getTime() < new Date(goalStartDate).getTime()) {
      newErrors.date = 'End time cannot be before start time';
    }
    const invalidSubTask = subTasks.find(st => st.startDate && st.deadline && new Date(st.deadline).getTime() < new Date(st.startDate).getTime());
    if (invalidSubTask) {
      newErrors.date = `Subgoal "${invalidSubTask.title || 'Untitled'}" end time cannot be before start time`;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    let previousGoalsSnapshot: any[] | null = null;

    try {
      previousGoalsSnapshot = goals;
      let finalCategoryId = newGoalCategory;
      
      // Handle inline category creation
      if (isCreatingCategory) {
        const catRef = await addDoc(collection(db, 'categories'), {
          uid: user.uid,
          name: inlineCategoryName.trim(),
          color: '#3B82F6',
          icon: 'folder',
          createdAt: serverTimestamp()
        });
        finalCategoryId = catRef.id;
      }

      // Handle date logic
      let finalStartDate = null;
      if (goalStartDate) {
        finalStartDate = new Date(goalStartDate);
      }
      
      let finalDeadline = null;
      if (goalEndDate) {
        finalDeadline = new Date(goalEndDate);
      }

      const normalizedSubTasks = normalizeSubTasksForSave(subTasks).filter(st => st.title);
      const safeGoalType = normalizeGoalType(goalType);
      const safeProgressType = normalizeProgressType(progressType);
      const subTaskPercentage = calculateSubTaskPercentage(normalizedSubTasks);
      const allSubTasksCompleted = normalizedSubTasks.length > 0 && normalizedSubTasks.every(st => st.completed);
      const shouldAutoCompleteFromSubTasks = safeProgressType === 'percentage' && allSubTasksCompleted;
      const shouldStoreCompleted = goalStatus === 'completed' || shouldAutoCompleteFromSubTasks;

      const baseGoalData: any = {
        title: newGoalTitle.trim(),
        categoryId: finalCategoryId,
        priority: newGoalPriority,
        type: safeGoalType,
        status: shouldStoreCompleted ? 'completed' : 'pending',
        progressType: safeProgressType,
      };

      if (finalStartDate) {
        baseGoalData.startDate = finalStartDate;
      }

      if (finalDeadline) {
        baseGoalData.deadline = finalDeadline;
      }

      if (editingGoal) {
        let optimisticTargetValue: number | undefined;
        let tv: any = deleteField();
        if (targetValue) {
          optimisticTargetValue = parseFloat(targetValue);
          tv = optimisticTargetValue;
        } else if (safeProgressType === 'percentage') {
          optimisticTargetValue = 100;
          tv = optimisticTargetValue;
        }

        let optimisticCompletedValue: number | undefined;
        let cv: any = deleteField();
        if (safeProgressType === 'percentage' && normalizedSubTasks.length > 0) {
          optimisticCompletedValue = subTaskPercentage;
          cv = optimisticCompletedValue;
        } else if (completedValue) {
          optimisticCompletedValue = parseFloat(completedValue);
          cv = optimisticCompletedValue;
        } else if (safeProgressType === 'percentage') {
           optimisticCompletedValue = editingGoal?.completedValue || 0;
           cv = optimisticCompletedValue;
        } else if (safeProgressType === 'duration') {
           optimisticCompletedValue = editingGoal?.completedValue || 0;
           cv = optimisticCompletedValue;
        }

        const updateData = {
          ...baseGoalData,
          startDate: finalStartDate || deleteField(),
          deadline: finalDeadline || deleteField(),
          subjectId: subject.trim() ? subject.trim() : deleteField(),
          topicId: topic.trim() ? topic.trim() : deleteField(),
          conceptId: concept.trim() ? concept.trim() : deleteField(),
          targetValue: tv,
          completedValue: cv,
          repeatSchedule: repeatSchedule.trim() ? repeatSchedule.trim() : deleteField(),
          notes: notes.trim() ? notes.trim() : deleteField(),
          subTasks: normalizedSubTasks.length > 0 ? normalizedSubTasks : deleteField(),
          completedAt: shouldStoreCompleted ? (editingGoal.completedAt || serverTimestamp()) : deleteField(),
          description: deleteField(),
          estimatedTime: deleteField()
        };
        const optimisticUpdate: any = {
          ...editingGoal,
          ...baseGoalData,
          startDate: toOptimisticTimestamp(finalStartDate),
          deadline: toOptimisticTimestamp(finalDeadline),
          subjectId: subject.trim() ? subject.trim() : undefined,
          topicId: topic.trim() ? topic.trim() : undefined,
          conceptId: concept.trim() ? concept.trim() : undefined,
          targetValue: optimisticTargetValue,
          completedValue: optimisticCompletedValue,
          repeatSchedule: repeatSchedule.trim() ? repeatSchedule.trim() : undefined,
          notes: notes.trim() ? notes.trim() : undefined,
          subTasks: normalizedSubTasks.length > 0 ? normalizedSubTasks : undefined,
          completedAt: shouldStoreCompleted ? (editingGoal.completedAt || Timestamp.now()) : undefined,
          _optimistic: true
        };
        setGoals(prev => prev.map(goal => goal.id === editingGoal.id ? optimisticUpdate : goal));
        resetGoalForm();
        showToast('Goal updated successfully');
        await updateDoc(doc(db, 'goals', editingGoal.id), updateData);
      } else {
        const goalRef = doc(collection(db, 'goals'));
        const createData: any = {
          ...baseGoalData,
          uid: user.uid,
          createdAt: serverTimestamp()
        };
        if (shouldStoreCompleted) createData.completedAt = serverTimestamp();
        if (subject.trim()) createData.subjectId = subject.trim();
        if (topic.trim()) createData.topicId = topic.trim();
        if (concept.trim()) createData.conceptId = concept.trim();
        if (targetValue) {
          createData.targetValue = parseFloat(targetValue);
        } else if (safeProgressType === 'percentage') {
          createData.targetValue = 100;
        }

        if (safeProgressType === 'percentage' && normalizedSubTasks.length > 0) {
           createData.completedValue = subTaskPercentage;
        } else if (completedValue) {
           createData.completedValue = parseFloat(completedValue);
        } else if (safeProgressType === 'percentage') {
           createData.completedValue = 0;
        } else if (safeProgressType === 'duration') {
           createData.completedValue = 0;
        }
        if (repeatSchedule.trim()) createData.repeatSchedule = repeatSchedule.trim();
        if (notes.trim()) createData.notes = notes.trim();
        if (normalizedSubTasks.length > 0) createData.subTasks = normalizedSubTasks;
        
        const optimisticGoal: any = {
          ...createData,
          id: goalRef.id,
          createdAt: Timestamp.now(),
          startDate: toOptimisticTimestamp(finalStartDate),
          deadline: toOptimisticTimestamp(finalDeadline),
          completedAt: shouldStoreCompleted ? Timestamp.now() : undefined,
          _optimistic: true
        };
        setGoals(prev => [optimisticGoal, ...prev.filter(goal => goal.id !== goalRef.id)]);
        resetGoalForm();
        showToast('Goal created successfully');
        await setDoc(goalRef, createData);
      }
    } catch (error) {
      if (previousGoalsSnapshot) {
        setGoals(previousGoalsSnapshot);
      }
      console.error('Goal save failed', error);
      showToast(error instanceof Error ? error.message : 'Could not save goal. Please try again.');
    }
  };

  const handleAddSubTask = () => {
    if (!newSubTaskTitle.trim()) return;
    setSubTasks([...subTasks, { id: crypto.randomUUID(), title: newSubTaskTitle.trim(), completed: false, priority: '' }]);
    setNewSubTaskTitle('');
  };

  const handleRemoveSubTask = (id: string) => {
    setSubTasks(subTasks.filter(st => st.id !== id));
  };

  const toggleSubTaskStatus = async (goalId: string, currentSubTasks: any[], subTaskId: string, progressType?: string, goalType?: string) => {
    try {
      const updatedSubTasks = currentSubTasks.map(st => 
        st.id === subTaskId ? { ...st, completed: !st.completed } : st
      );
      
      const allCompleted = updatedSubTasks.length > 0 && updatedSubTasks.every(st => st.completed);
      
      const safeProgressType = normalizeProgressType(progressType);
      const updateData: any = {
        subTasks: updatedSubTasks,
        type: normalizeGoalType(goalType),
        progressType: safeProgressType
      };
      
      if (safeProgressType === 'percentage') {
        const completedCount = updatedSubTasks.filter(st => st.completed).length;
        const totalCount = updatedSubTasks.length;
        const autoPercentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
        updateData.completedValue = autoPercentage;
        updateData.targetValue = 100;
      }
      
      if (allCompleted) {
         updateData.status = 'completed';
         updateData.completedAt = serverTimestamp();
      } else {
         updateData.status = 'pending';
         updateData.completedAt = deleteField();
      }

      await updateDoc(doc(db, 'goals', goalId), updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `goals/${goalId}`);
    }
  };

  const toggleGoalStatus = async (goalId: string, currentStatus: string, goalSubTasks?: any[], progressType?: string, targetValue?: number, goalType?: string) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      const safeProgressType = normalizeProgressType(progressType);
      const updateData: any = {
        type: normalizeGoalType(goalType),
        progressType: safeProgressType,
        status: newStatus,
        completedAt: newStatus === 'completed' ? serverTimestamp() : deleteField()
      };

      if (goalSubTasks && goalSubTasks.length > 0) {
         updateData.subTasks = goalSubTasks.map(st => ({ ...st, completed: newStatus === 'completed' }));
      }
      
      if (safeProgressType === 'percentage' && newStatus === 'completed') {
          updateData.completedValue = 100;
          updateData.targetValue = 100;
      } else if (safeProgressType === 'percentage' && newStatus === 'pending') {
          updateData.completedValue = 0;
      }

      if (safeProgressType === 'duration' && newStatus === 'completed') {
          updateData.completedValue = targetValue || 0;
          updateData.actualTime = targetValue || 0;
      } else if (safeProgressType === 'duration' && newStatus === 'pending') {
          updateData.completedValue = 0;
          updateData.actualTime = 0;
      }

      await updateDoc(doc(db, 'goals', goalId), updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `goals/${goalId}`);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      await deleteDoc(doc(db, 'goals', goalId));
      setConfirmDelete(null);
      setActiveMenu(null);
      showToast('Goal deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `goals/${goalId}`);
    }
  };

  // Filter and Search Logic
  const filteredGoals = displayedGoals.filter(goal => {
    const matchesSearch = goal.title.toLowerCase().includes(searchQuery.toLowerCase());
    let matchesFilter = true;
    if (filter === 'pending') matchesFilter = goal.status === 'pending';
    if (filter === 'completed') matchesFilter = goal.status === 'completed';
    if (filter === 'high') matchesFilter = goal.priority === 'high';
    const matchesCategory = selectedCategoryId ? goal.categoryId === selectedCategoryId : true;
    return matchesSearch && matchesFilter && matchesCategory;
  });

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } };

  return (
    <div className="p-6 md:p-8 lg:p-10 pb-32 min-h-screen relative max-w-7xl mx-auto text-gray-900 dark:text-gray-100 transition-colors duration-300">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-slate-800 text-white px-6 py-3 rounded-full shadow-2xl z-[100] font-medium text-sm flex items-center gap-2 whitespace-nowrap"
          >
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Quick Actions */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-6 pt-4"
      >
        <h1 className="text-3xl font-display font-bold text-gray-900 dark:text-white tracking-tight">Goals</h1>
        <div className="flex gap-3">
          <Link 
            to="/organization"
            className="w-12 h-12 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors active:scale-95 shadow-sm"
          >
            <Folder className="w-5 h-5" />
          </Link>
          <button 
            onClick={() => { resetGoalForm(); setShowAddGoal(true); }}
            className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 shadow-[0_8px_20px_rgba(37,99,235,0.3)] dark:shadow-[0_0_15px_rgba(59,130,246,0.4)] transition-colors active:scale-95"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          {/* Search Bar */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search goals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-2xl pl-12 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-[15px] dark:text-white dark:placeholder-gray-500 transition-colors duration-300"
            />
          </motion.div>

          {/* Categories Horizontal Scroll / Vertical List */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="flex justify-between items-end mb-4 ml-1">
              <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Categories</h2>
            </div>
            
            <div className="flex lg:flex-col gap-4 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 -mx-6 px-6 lg:mx-0 lg:px-0 no-scrollbar snap-x">
              {categories.length === 0 && !loading ? (
                <button 
                  onClick={() => setShowAddCategory(true)}
                  className="bg-white dark:bg-slate-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-[1.5rem] p-5 min-w-[160px] lg:w-full flex flex-col items-center justify-center text-center shrink-0 snap-start hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-2">
                    <Plus className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  </div>
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Create Category</span>
                </button>
              ) : (
                categories.map(cat => (
                  <motion.div 
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    key={cat.id} 
                    onClick={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
                    className={cn(
                      "bg-white dark:bg-slate-900 border rounded-[1.5rem] p-5 min-w-[140px] lg:w-full shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-none shrink-0 snap-start cursor-pointer transition-colors duration-300",
                      selectedCategoryId === cat.id 
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 ring-1 ring-blue-500" 
                        : "border-gray-100 dark:border-white/5 hover:dark:border-white/10"
                    )}
                  >
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: `${cat.color}15`, color: cat.color }}>
                      <Folder className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg">{cat.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">{displayedGoals.filter(g => g.categoryId === cat.id).length} goals</p>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </div>

        <div className="lg:col-span-3">
          {/* Filter Tabs */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex gap-2 overflow-x-auto no-scrollbar mb-6 -mx-6 px-6 lg:mx-0 lg:px-0"
          >
            {[
              { id: 'all', label: 'All Goals' },
              { id: 'pending', label: 'Pending' },
              { id: 'completed', label: 'Completed' },
              { id: 'high', label: 'High Priority' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-300",
                  filter === f.id 
                    ? "bg-gray-900 dark:bg-blue-600/20 text-white dark:text-blue-400 shadow-md dark:shadow-[0_0_15px_rgba(59,130,246,0.3)] dark:border dark:border-blue-500/30" 
                    : "bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 dark:hover:text-gray-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </motion.div>

          {/* Goals List */}
          <div>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 bg-gray-100 dark:bg-slate-900 rounded-[1.5rem] animate-pulse"></div>
            ))}
          </div>
        ) : filteredGoals.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 bg-white dark:bg-slate-900 rounded-[2rem] border border-gray-100 dark:border-white/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)] dark:shadow-none"
          >
            <div className="w-20 h-20 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-5">
              <Target className="w-10 h-10 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-gray-900 dark:text-white font-bold text-lg mb-2">No goals found</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-[200px] mx-auto mb-6">
              {searchQuery ? "Try a different search term." : "Tap the + button to create your first goal."}
            </p>
          </motion.div>
        ) : (
          <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
            {filteredGoals.map(goal => {
              const category = categories.find(c => c.id === goal.categoryId);
              const isMissed = goal.status === 'missed';
              const isPriority = goal.priority === 'high' && goal.status !== 'completed';
              const goalWorkedMinutes = getGoalWorkedMinutes(goal);
              const durationTarget = getDurationTargetMinutes(goal);
              const durationActual = getDurationActualMinutes(goal);
              const durationRemaining = getRemainingDurationMinutes(goal);
              const progressPercent = goal.progressType === 'duration' && durationTarget > 0
                ? Math.min(100, Math.round((durationActual / durationTarget) * 100))
                : goal.progressType === 'percentage'
                  ? Math.min(100, Number(goal.completedValue || 0))
                  : 0;

              return (
                <motion.div 
                  variants={item}
                  key={goal.id} 
                  className={cn(
                    "flex items-start gap-4 p-5 rounded-[1.5rem] border transition-all duration-300 relative overflow-visible",
                    goal.status === 'completed' 
                      ? "bg-gray-50/50 dark:bg-slate-900/50 border-transparent opacity-75" 
                      : cn(
                          "bg-white dark:bg-slate-900 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] dark:shadow-none hover:dark:border-white/10",
                          isMissed ? "bg-red-50/50 dark:bg-red-900/10 border-l-[6px] border-l-red-500 border-red-100 dark:border-red-900/40" : "border-gray-100 dark:border-white/5",
                          isPriority ? "ring-2 ring-red-400 dark:ring-red-500 shadow-[0_0_15px_-3px_rgba(239,68,68,0.5)] dark:shadow-[0_0_20px_-3px_rgba(239,68,68,0.4)] z-10" : ""
                        )
                  )}
                >
                  <button 
                    onClick={() => toggleGoalStatus(goal.id, goal.status, goal.subTasks, goal.progressType, goal.targetValue, goal.type)}
                    className="shrink-0 mt-0.5 transition-transform active:scale-75"
                  >
                    {goal.status === 'completed' ? (
                      <CheckCircle2 className="w-7 h-7 text-gray-900 dark:text-gray-400 fill-gray-100 dark:fill-slate-800" />
                    ) : goal.status === 'missed' ? (
                      <X className="w-7 h-7 text-red-500 bg-red-50 dark:bg-red-500/10 rounded-full p-1" />
                    ) : goal.status === 'in-progress' ? (
                      <div className="w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                    ) : (
                      <Circle className="w-7 h-7 text-gray-300 dark:text-slate-700 hover:text-blue-400 transition-colors" />
                    )}
                  </button>
                  
                  <div className="flex-1 min-w-0 pr-8">
                    <h4 className={cn(
                      "font-medium text-[17px] truncate transition-colors mb-2",
                      goal.status === 'completed' ? "text-gray-400 dark:text-gray-500 line-through" : 
                      goal.status === 'missed' ? "text-red-500 dark:text-red-400" : "text-gray-900 dark:text-white"
                    )}>
                      {goal.title}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {category && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">
                          {category.name}
                        </span>
                      )}
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg",
                        goal.priority === 'high' ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" :
                        goal.priority === 'medium' ? "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" :
                        "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                      )}>
                        {goal.priority}
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg",
                        goal.status === 'completed' ? "bg-green-50 text-green-600 dark:bg-emerald-500/10 dark:text-emerald-400" :
                        goal.status === 'missed' ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" :
                        goal.status === 'in-progress' ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" :
                        "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300"
                      )}>
                        {getStatusLabel(goal.status)}
                      </span>
                      {renderDateBadges(goal.startDate, goal.deadline)}
                    </div>

                    {/* Sub Tasks rendering  */}
                    {(goal.subTasks && goal.subTasks.length > 0) && (
                      <div className="mt-4 pt-3 border-t border-gray-100/50 dark:border-white/5 space-y-2">
                        {goal.subTasks.map((st: any) => {
                          const subTaskWorkedMinutes = getSubTaskWorkedMinutes(st);
                          return (
                           <div key={st.id} className="flex items-center gap-3 bg-gray-50/50 dark:bg-slate-800/30 rounded-lg px-3 py-2 border border-gray-100/50 dark:border-white/5">
                             <button 
                               onClick={() => toggleSubTaskStatus(goal.id, goal.subTasks, st.id, goal.progressType, goal.type)}
                               className="shrink-0 transition-transform active:scale-90"
                             >
                               {st.completed ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-500 fill-green-50 dark:fill-green-900/30" />
                               ) : (
                                  <Circle className="w-5 h-5 text-gray-300 dark:text-slate-600 hover:text-blue-400 transition-colors" />
                               )}
                             </button>
                             <span className={cn(
                               "text-sm font-medium flex-1", 
                               st.completed ? "text-gray-400 line-through dark:text-gray-500" : "text-gray-700 dark:text-gray-300"
                             )}>
                               {st.title}
                             </span>
                             {st.priority && (
                               <span className={cn(
                                 "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0",
                                 st.priority === 'high' ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" :
                                 st.priority === 'medium' ? "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" :
                                 "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                               )}>
                                 {st.priority}
                               </span>
                             )}
                             {renderDateBadges(st.startDate, st.deadline)}
                             <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">
                               {subTaskWorkedMinutes} min
                             </span>
                             {goal.status !== 'completed' && !st.completed && (
                               <Link
                                 to="/focus"
                                 state={{ goalId: goal.id, subTaskId: st.id, mode: 'goal' }}
                                 className="shrink-0 p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                               >
                                 <Play className="w-3.5 h-3.5 fill-current" />
                               </Link>
                             )}
                           </div>
                          );
                        })}
                      </div>
                    )}

                    {/* New Fields Display */}
                    {(goal.notes || goalWorkedMinutes > 0 || goal.progressType !== 'checkbox' || goal.repeatSchedule) && (
                      <div className="mt-3 pt-3 border-t border-gray-100/50 dark:border-white/5 space-y-2">
                        {goal.progressType !== 'checkbox' && (
                          <div className="space-y-1.5">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              <span className="font-semibold dark:text-gray-300">Progress:</span> {goal.completedValue || 0} / {goal.targetValue || 0} {goal.progressType === 'percentage' ? '%' : goal.progressType === 'duration' ? ' mins' : ''}
                            </p>
                            {(goal.progressType === 'percentage' || goal.progressType === 'duration') && (
                              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-all"
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                        {goal.repeatSchedule && (
                          <p className="text-xs text-gray-500 dark:text-gray-400"><span className="font-semibold dark:text-gray-300">Repeat:</span> {goal.repeatSchedule}</p>
                        )}
                        {goal.notes && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2"><span className="font-semibold dark:text-gray-300">Notes:</span> {goal.notes}</p>
                        )}
                        {goalWorkedMinutes > 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-semibold dark:text-gray-300">Worked:</span> {goalWorkedMinutes} mins
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>

                    {/* Actions Menu Trigger */}
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                       {goal.status !== 'completed' && (
                          <Link
                            to="/focus"
                            state={{ goalId: goal.id, mode: 'goal', durationMinutes: durationRemaining || durationTarget || 25 }}
                            className="inline-flex items-center gap-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            {goal.progressType === 'duration' && durationRemaining > 0 ? `${durationRemaining}m` : 'Focus'}
                          </Link>
                       )}
                      <button 
                        onClick={() => setActiveMenu(activeMenu === goal.id ? null : goal.id)}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Actions Menu Overlay */}
                  <AnimatePresence>
                    {activeMenu === goal.id && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, transformOrigin: 'top right' }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute top-4 right-12 bg-white dark:bg-slate-800 shadow-xl dark:shadow-2xl rounded-xl border border-gray-100 dark:border-white/10 p-1.5 flex gap-1 z-10"
                      >
                        <button 
                          onClick={() => openEditGoal(goal)} 
                          className="p-2.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => { setConfirmDelete(goal.id); setActiveMenu(null); }} 
                          className="p-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setActiveMenu(null)} 
                          className="p-2.5 text-gray-400 hover:bg-gray-50 dark:hover:bg-white/10 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Confirm Delete Overlay */}
                  <AnimatePresence>
                    {confirmDelete === goal.id && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm flex items-center justify-center gap-3 z-20 px-4 transition-colors duration-300"
                      >
                        <span className="text-sm font-bold text-gray-900 dark:text-white mr-2">Delete goal?</span>
                        <button 
                          onClick={() => handleDeleteGoal(goal.id)} 
                          className="px-5 py-2 bg-red-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-200 dark:shadow-[0_0_15px_rgba(220,38,38,0.4)] active:scale-95 transition-transform"
                        >
                          Delete
                        </button>
                        <button 
                          onClick={() => setConfirmDelete(null)} 
                          className="px-5 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-sm font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-95 transition-transform"
                        >
                          Cancel
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
        </div>
      </div>

      {/* Add Category Bottom Sheet */}
      <AnimatePresence>
        {showAddCategory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddCategory(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2 left-0 right-0 md:left-1/2 md:-translate-x-1/2 bg-white dark:bg-slate-900 rounded-t-[2rem] md:rounded-[2rem] p-6 z-[70] shadow-2xl max-w-md w-full mx-auto border border-transparent dark:border-white/10"
            >
              <div className="w-12 h-1.5 bg-gray-200 dark:bg-slate-800 rounded-full mx-auto mb-6 md:hidden" />
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-display font-bold text-gray-900 dark:text-white">New Category</h2>
                <button onClick={() => setShowAddCategory(false)} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-500 dark:text-gray-400 hover:dark:bg-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddCategory}>
                <input
                  type="text"
                  placeholder="Category Name (e.g. Fitness)"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-white/10 rounded-2xl px-5 py-4 mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500/50 text-lg dark:text-white dark:placeholder-gray-500 transition-colors"
                  required
                />
                <button 
                  type="submit"
                  className="w-full py-4 font-bold text-lg text-white bg-blue-600 rounded-2xl active:scale-[0.98] transition-transform shadow-[0_8px_20px_rgba(37,99,235,0.3)] dark:shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:bg-blue-700"
                >
                  Save Category
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add/Edit Goal Bottom Sheet */}
      <AnimatePresence>
        {showAddGoal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetGoalForm}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2 left-0 right-0 md:left-1/2 md:-translate-x-1/2 bg-white dark:bg-slate-900 rounded-t-[2rem] md:rounded-[2rem] z-[70] shadow-2xl max-w-lg w-full mx-auto flex flex-col max-h-[90vh] border border-transparent dark:border-white/10"
            >
              {/* Header */}
              <div className="p-6 pb-4 shrink-0 border-b border-gray-100 dark:border-white/5">
                <div className="w-12 h-1.5 bg-gray-200 dark:bg-slate-800 rounded-full mx-auto mb-6 md:hidden" />
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-display font-bold text-gray-900 dark:text-white">
                    {editingGoal ? 'Edit Goal' : 'New Goal'}
                  </h2>
                  <button onClick={resetGoalForm} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                <form id="goal-form" onSubmit={handleSaveGoal} className="space-y-6">
                  
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="What do you want to achieve?"
                      value={newGoalTitle}
                      onChange={(e) => { setNewGoalTitle(e.target.value); if(errors.title) setErrors({...errors, title: undefined}); }}
                      className={cn(
                        "w-full bg-gray-50 dark:bg-slate-800/50 border rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg transition-all dark:text-white dark:placeholder-gray-500",
                        errors.title ? "border-red-300 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10" : "border-gray-200 dark:border-white/10"
                      )}
                    />
                    {errors.title && <p className="text-red-500 text-xs font-medium mt-1.5 ml-1">{errors.title}</p>}
                  </div>
                  
                  {/* Category */}
                  <div>
                    <div className="flex justify-between items-end mb-2 ml-1">
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <button 
                        type="button" 
                        onClick={() => { setIsCreatingCategory(!isCreatingCategory); setShowCategoryDropdown(false); if(errors.category) setErrors({...errors, category: undefined}); }} 
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        {isCreatingCategory ? 'Choose Existing' : '+ New Category'}
                      </button>
                    </div>
                    
                    {isCreatingCategory ? (
                      <input
                        type="text"
                        placeholder="New category name..."
                        value={inlineCategoryName}
                        onChange={(e) => { setInlineCategoryName(e.target.value); if(errors.category) setErrors({...errors, category: undefined}); }}
                        className={cn(
                          "w-full bg-gray-50 dark:bg-slate-800/50 border rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg transition-all dark:text-white dark:placeholder-gray-500",
                          errors.category ? "border-red-300 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10" : "border-gray-200 dark:border-white/10"
                        )}
                        autoFocus
                      />
                    ) : (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowCategoryDropdown(prev => !prev)}
                          className={cn(
                            "w-full bg-gray-50 dark:bg-slate-800/50 border rounded-2xl px-5 py-4 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg transition-all dark:text-white text-left",
                            errors.category ? "border-red-300 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10" : "border-gray-200 dark:border-white/10",
                            !newGoalCategory && "text-gray-400 dark:text-gray-500"
                          )}
                        >
                          {categories.find(cat => cat.id === newGoalCategory)?.name || 'Select a category'}
                        </button>
                        <ChevronDown className={cn(
                          "absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none transition-transform",
                          showCategoryDropdown && "rotate-180"
                        )} />

                        <AnimatePresence>
                          {showCategoryDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: -6, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -6, scale: 0.98 }}
                              transition={{ duration: 0.15 }}
                              className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[90] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setNewGoalCategory('');
                                  setShowCategoryDropdown(false);
                                }}
                                className="w-full px-5 py-3 text-left text-sm font-semibold text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                              >
                                Select a category
                              </button>
                              <div className="max-h-56 overflow-y-auto p-1.5">
                                {categories.map(cat => (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => {
                                      setNewGoalCategory(cat.id);
                                      setShowCategoryDropdown(false);
                                      if (errors.category) setErrors({ ...errors, category: undefined });
                                      setSubject('');
                                      setTopic('');
                                      setConcept('');
                                    }}
                                    className={cn(
                                      "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-slate-200 transition-colors hover:bg-blue-500/15 hover:text-white",
                                      newGoalCategory === cat.id && "bg-blue-500/20 text-blue-200"
                                    )}
                                  >
                                    <span
                                      className="h-8 w-8 shrink-0 rounded-xl border border-white/10"
                                      style={{ backgroundColor: `${cat.color || '#3B82F6'}25` }}
                                    />
                                    <span className="truncate">{cat.name}</span>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                    {errors.category && <p className="text-red-500 text-xs font-medium mt-1.5 ml-1">{errors.category}</p>}
                  </div>

                  {/* Timeline */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Start Time (Optional)</label>
                      <div className="relative">
                        <input
                          type="datetime-local"
                          value={goalStartDate}
                          onChange={(e) => {
                            const nextStart = e.target.value;
                            setGoalStartDate(nextStart);
                            if (errors.date) setErrors({ ...errors, date: undefined });
                            if (goalEndDate && nextStart && new Date(goalEndDate).getTime() < new Date(nextStart).getTime()) {
                              setGoalEndDate('');
                            }
                          }}
                          className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-white/10 rounded-2xl px-5 py-4 pr-11 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:text-white dark:[color-scheme:dark] transition-colors"
                        />
                        {goalStartDate && (
                          <button
                            type="button"
                            onClick={() => {
                              setGoalStartDate('');
                              if (errors.date) setErrors({ ...errors, date: undefined });
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">End Time (Optional)</label>
                      <div className="relative">
                        <input
                          type="datetime-local"
                          value={goalEndDate}
                          min={goalStartDate || undefined}
                          onChange={(e) => {
                            setGoalEndDate(e.target.value);
                            if (errors.date) setErrors({ ...errors, date: undefined });
                          }}
                          className={cn(
                            "w-full bg-gray-50 dark:bg-slate-800/50 border rounded-2xl px-5 py-4 pr-11 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:text-white dark:[color-scheme:dark] transition-colors",
                            errors.date ? "border-red-300 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10" : "border-gray-200 dark:border-white/10"
                          )}
                        />
                        {goalEndDate && (
                          <button
                            type="button"
                            onClick={() => {
                              setGoalEndDate('');
                              if (errors.date) setErrors({ ...errors, date: undefined });
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {errors.date && (
                      <p className="col-span-2 text-red-500 text-xs font-medium -mt-2 ml-1">{errors.date}</p>
                    )}
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Priority</label>
                    <div className="flex gap-2 p-1 bg-gray-100 dark:bg-slate-800 rounded-2xl transition-colors">
                      {[
                        { id: 'low', label: 'Low', activeColor: 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' },
                        { id: 'medium', label: 'Medium', activeColor: 'bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.5)]' },
                        { id: 'high', label: 'High', activeColor: 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]' }
                      ].map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setNewGoalPriority(p.id)}
                          className={cn(
                            "flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-200",
                            newGoalPriority === p.id ? p.activeColor : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Optional Fields Toggle */}
                  <div className="pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowOptional(!showOptional)} 
                      className="flex items-center justify-center gap-2 w-full py-3 text-sm font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/50 rounded-2xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {showOptional ? 'Hide Details' : 'Add More Details (Optional)'}
                      {showOptional ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  <AnimatePresence>
                    {showOptional && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: 'auto' }} 
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-6 overflow-hidden pt-2"
                      >
                        {/* Goal Type */}
                        <div>
                          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Goal Type</label>
                          <div className="grid grid-cols-2 gap-2">
                            {['daily', 'weekly', 'monthly', 'one-time'].map(t => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setGoalType(t)}
                                className={cn(
                                  "py-2.5 rounded-xl text-sm font-bold capitalize border transition-colors",
                                  goalType === t 
                                    ? "bg-gray-900 dark:bg-blue-600/20 border-gray-900 dark:border-blue-500/30 text-white dark:text-blue-400" 
                                    : "bg-white dark:bg-slate-800 border-gray-200 dark:border-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700"
                                )}
                              >
                                {t.replace('-', ' ')}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Sub Tasks (Nested Goals) */}
                        <div>
                          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Sub Tasks</label>
                          <div className="space-y-3 mb-3">
                            {subTasks.map(st => (
                              <div key={st.id} className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-white/5 rounded-xl p-3 space-y-3">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={st.title}
                                    onChange={(e) => updateSubTask(st.id, { title: e.target.value })}
                                    className="flex-1 min-w-0 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm font-medium dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <button type="button" onClick={() => handleRemoveSubTask(st.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Start</label>
                                    <div className="relative">
                                      <input
                                        type="datetime-local"
                                        value={st.startDate || ''}
                                        onChange={(e) => handleSubTaskStartChange(st.id, e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 pr-9 text-xs dark:text-white dark:[color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                      {st.startDate && (
                                        <button type="button" onClick={() => updateSubTask(st.id, { startDate: '' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500">
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">End</label>
                                    <div className="relative">
                                      <input
                                        type="datetime-local"
                                        value={st.deadline || ''}
                                        min={st.startDate || undefined}
                                        onChange={(e) => handleSubTaskEndChange(st.id, e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 pr-9 text-xs dark:text-white dark:[color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                      {st.deadline && (
                                        <button type="button" onClick={() => updateSubTask(st.id, { deadline: '' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500">
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Priority</label>
                                  <div className="grid grid-cols-4 gap-1 p-1 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-100 dark:border-white/5">
                                    {[
                                      { id: '', label: 'None', active: 'bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 shadow-sm' },
                                      { id: 'low', label: 'Low', active: 'bg-blue-500 text-white' },
                                      { id: 'medium', label: 'Medium', active: 'bg-orange-500 text-white' },
                                      { id: 'high', label: 'High', active: 'bg-red-500 text-white' }
                                    ].map(p => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => updateSubTask(st.id, { priority: p.id as SubTask['priority'] })}
                                        className={cn(
                                          "py-1.5 rounded-md text-[11px] font-bold transition-colors",
                                          (st.priority || '') === p.id ? p.active : "text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-slate-700"
                                        )}
                                      >
                                        {p.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Add a sub-task..."
                              value={newSubTaskTitle}
                              onChange={(e) => setNewSubTaskTitle(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubTask(); } }}
                              className="flex-1 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:text-white dark:placeholder-gray-500 transition-colors"
                            />
                            <button
                              type="button"
                              onClick={handleAddSubTask}
                              className="bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 rounded-xl px-4 py-2 hover:bg-blue-100 dark:hover:bg-blue-500/30 transition-colors font-bold text-sm"
                            >
                              Add
                            </button>
                          </div>
                        </div>

                        {/* Progress Tracking */}
                        <div className="space-y-4">
                          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 ml-1">Progress Type</label>
                          <div className="grid grid-cols-2 gap-2">
                            {['checkbox', 'percentage', 'duration'].map(t => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setProgressType(t)}
                                className={cn(
                                  "py-2.5 rounded-xl text-sm font-bold capitalize border transition-colors",
                                  progressType === t 
                                    ? "bg-gray-900 dark:bg-blue-600/20 border-gray-900 dark:border-blue-500/30 text-white dark:text-blue-400" 
                                    : "bg-white dark:bg-slate-800 border-gray-200 dark:border-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700"
                                )}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                          
                          {progressType === 'duration' && (
                            <div>
                              <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">
                                  Target Time (mins)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="e.g. 60"
                                  value={targetValue}
                                  onChange={(e) => setTargetValue(e.target.value)}
                                  className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Repeat Schedule */}
                        <div>
                          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Repeat Schedule</label>
                          <input
                            type="text"
                            placeholder="e.g. Every Monday, Daily, Weekdays"
                            value={repeatSchedule}
                            onChange={(e) => setRepeatSchedule(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white dark:placeholder-gray-500 transition-colors"
                          />
                        </div>

                        {/* Notes */}
                        <div>
                          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Notes</label>
                          <textarea
                            placeholder="Add detailed notes..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg resize-none dark:text-white dark:placeholder-gray-500 transition-colors"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </form>
              </div>

              {/* Fixed Footer Actions */}
              <div className="p-6 pt-4 shrink-0 border-t border-gray-100 dark:border-white/5 bg-white dark:bg-slate-900 pb-safe flex gap-3 transition-colors">
                <button 
                  type="button"
                  onClick={resetGoalForm}
                  className="flex-1 py-4 font-bold text-lg text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-800 rounded-2xl active:scale-[0.98] transition-transform hover:bg-gray-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  form="goal-form"
                  className="flex-[2] py-4 font-bold text-lg text-white bg-blue-600 dark:bg-blue-600 rounded-2xl active:scale-[0.98] transition-transform shadow-[0_8px_20px_rgba(37,99,235,0.3)] dark:shadow-[0_0_15px_rgba(59,130,246,0.4)] hover:bg-blue-700 dark:hover:bg-blue-500"
                >
                  {editingGoal ? 'Update Goal' : 'Save Goal'}
                </button>
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
