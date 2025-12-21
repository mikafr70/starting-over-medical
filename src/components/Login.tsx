import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Heart, Loader2 } from "lucide-react";
import React from "react";
import { toast } from "sonner";

interface LoginProps {
  onLogin: (username: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('התחברת בהצלחה!');
        onLogin(loginEmail);
      } else {
        toast.error(data.error || 'אימייל או סיסמה שגויים');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('שגיאה בהתחברות. נסה שוב.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(registerName || "מטפל/ת");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F7F3ED' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Heart className="w-12 h-12" style={{ color: '#A67C52' }} fill="#A67C52" />
          </div>
          <h1 className="mb-2">מקלט שיקומי "להתחיל מחדש"</h1>
          <p className="text-muted-foreground">מערכת ניהול טיפולים רפואיים</p>
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2" style={{ backgroundColor: '#CFE4D3' }}>
            <TabsTrigger value="login">התחברות</TabsTrigger>
            <TabsTrigger value="register">הרשמה</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle className="text-right">התחברות</CardTitle>
                <CardDescription className="text-right">הכנס את פרטי ההתחברות שלך</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4 text-right">
                  <div className="space-y-2 text-right">
                    <Label htmlFor="email" dir="rtl" className="text-right block">אימייל</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="text-right"
                      dir="rtl"
                    />
                  </div>
                  <div className="space-y-2 text-right">
                    <Label htmlFor="password" dir="rtl" className="text-right block">סיסמה</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="text-right"
                      dir="rtl"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        מתחבר...
                      </>
                    ) : (
                      'התחבר'
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle className="text-right text-[20px]">הרשמה</CardTitle>
                <CardDescription className="text-right text-[16px]">צור חשבון חדש למטפל/ת</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2 text-right">
                    <Label htmlFor="name">שם מלא</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="שם פרטי ומשפחה"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      required className="text-right"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">אימייל</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="name@example.com"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">סיסמה</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="••••••••"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    הירשם
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
