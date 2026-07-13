import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Loader2, X, ListTodo } from "lucide-react";
import { toast } from "sonner";

interface Task {
  text: string;
  type: string;
}

const TASK_TAGS = ["העברה", "איש מקצוע/טיפול", "אירוע", "המשך טיפול", "משימות", "עדכונים"];

// Format a Date as DD.MM.YYYY (matches the format used across the app)
const formatDate = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

export default function Tasks() {
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(new Date())); // DD.MM.YYYY
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskType, setNewTaskType] = useState<string>(TASK_TAGS[0]);
  const [filterType, setFilterType] = useState<string>('all');

  // Fetch tasks whenever the selected date changes
  useEffect(() => {
    const fetchTasks = async () => {
      if (!selectedDate) return;

      try {
        setLoading(true);
        const response = await fetch(`/api/daily-events?date=${encodeURIComponent(selectedDate)}`);
        const data = await response.json();

        if (response.ok) {
          setTasks(data.events || []);
        } else {
          console.error('Failed to fetch tasks:', data.error);
          toast.error('שגיאה בטעינת המשימות');
        }
      } catch (err) {
        console.error('Error fetching tasks:', err);
        toast.error('שגיאה בחיבור לשרת');
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [selectedDate]);

  const handleSaveTask = async () => {
    if (!newTaskText.trim() || !selectedDate) return;

    try {
      setSaving(true);
      const response = await fetch('/api/daily-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          event: newTaskText.trim(),
          type: newTaskType
        })
      });

      const data = await response.json();

      if (response.ok) {
        setTasks([...tasks, { text: newTaskText.trim(), type: newTaskType }]);
        setNewTaskText('');
        toast.success('המשימה נשמרה בהצלחה');
      } else {
        console.error('Failed to save task:', data.error);
        toast.error('שגיאה בשמירת המשימה');
      }
    } catch (err) {
      console.error('Error saving task:', err);
      toast.error('שגיאה בחיבור לשרת');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async (taskToDelete: Task) => {
    try {
      const response = await fetch('/api/daily-events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          event: taskToDelete.text
        })
      });

      const data = await response.json();

      if (response.ok) {
        setTasks(tasks.filter(t => t.text !== taskToDelete.text));
        toast.success('המשימה נמחקה בהצלחה');
      } else {
        console.error('Failed to delete task:', data.error);
        toast.error('שגיאה במחיקת המשימה');
      }
    } catch (err) {
      console.error('Error deleting task:', err);
      toast.error('שגיאה בחיבור לשרת');
    }
  };

  const filteredTasks = filterType === 'all' ? tasks : tasks.filter(t => t.type === filterType);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8" style={{ backgroundColor: '#F7F3ED' }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <ListTodo className="w-6 h-6" style={{ color: '#A67C52' }} />
          <h1 className="text-[24px] text-right">משימות</h1>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-right">הוספת משימה</CardTitle>
            <CardDescription className="text-right">
              הוסף משימה או אירוע לתאריך נבחר
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-right whitespace-nowrap">תאריך:</label>
              <input
                type="date"
                value={selectedDate ? selectedDate.split('.').reverse().join('-') : ''}
                onChange={(e) => {
                  const [year, month, day] = e.target.value.split('-');
                  setSelectedDate(`${day}.${month}.${year}`);
                }}
                className="flex-1 px-3 py-2 border rounded-md text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-right whitespace-nowrap">תגית:</label>
              <Select value={newTaskType} onValueChange={setNewTaskType}>
                <SelectTrigger className="flex-1 text-right h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {TASK_TAGS.map(tag => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Textarea
              placeholder="הזן משימה או הערה..."
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              className="text-right resize-none"
              rows={3}
            />

            <Button
              onClick={handleSaveTask}
              disabled={!newTaskText.trim() || saving || !selectedDate}
              className="w-full"
              style={{ backgroundColor: '#A67C52' }}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  שומר...
                </>
              ) : (
                'שמור משימה'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-right">
                משימות ל-{selectedDate}
              </CardTitle>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[180px] text-right h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">כל התגיות</SelectItem>
                  {TASK_TAGS.map(tag => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : filteredTasks.length === 0 ? (
                <p className="text-muted-foreground text-center py-8 text-sm">
                  {tasks.length === 0 ? 'אין משימות ליום זה' : 'אין משימות בתגית זו'}
                </p>
              ) : (
                filteredTasks.map((task, index) => (
                  <div
                    key={index}
                    className="group p-3 bg-muted rounded-lg text-right text-sm border flex items-start justify-between gap-2 hover:bg-muted/80 transition-colors"
                    style={{ borderColor: '#E7E7E7' }}
                  >
                    <div className="flex-1 space-y-1">
                      <span>{task.text}</span>
                      {task.type && (
                        <div>
                          <Badge variant="outline">{task.type}</Badge>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={() => handleDeleteTask(task)}
                    >
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
