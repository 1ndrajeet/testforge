// modules/exam-setup/center-profile.tsx
'use client';

import { useEffect, useState } from 'react';

import { Building2, CheckCircle, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useUserInfo } from '@/hooks/useUserInfo';
import { updateExamCenter } from '@/lib/actions/exam-center';

export default function CenterProfilePage() {
  const { examCenter, refetch } = useUserInfo();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    address: '',
    officerIncharge: '',
    sealingSupervisor: '',
    distCenterCode: '',
    distCenterName: '',
    season: 'Summer',
    examYear: new Date().getFullYear(),
  });

  useEffect(() => {
    if (examCenter) {
      setFormData({
        code: examCenter.code || '',
        name: examCenter.name || '',
        address: examCenter.address || '',
        officerIncharge: examCenter.officerIncharge || '',
        sealingSupervisor: examCenter.sealingSupervisor || '',
        distCenterCode: examCenter.distCenterCode || '',
        distCenterName: examCenter.distCenterName || '',
        season: (examCenter.season as 'Summer' | 'Winter') || 'Summer',
        examYear: examCenter.examYear || new Date().getFullYear(),
      });
    }
  }, [examCenter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateExamCenter(formData);
      await refetch();
      setSuccess(true);
      toast.success('Exam center updated successfully');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="from-primary to-primary flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exam Center Profile</h1>
          <p className="text-sm text-neutral-500">Configure your exam center details</p>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Center Information</CardTitle>
            <CardDescription>Basic details about your examination center</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {success && (
              <Alert className="border-green-200 bg-green-50 text-green-800">
                <CheckCircle className="mr-2 h-4 w-4" />
                <AlertDescription>Exam center updated successfully!</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Center Code *</Label>
                <Input
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., 1740"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Center Name *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Full institute name"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                placeholder="Full postal address"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Officer In-charge</Label>
                <Input
                  value={formData.officerIncharge}
                  onChange={e => setFormData({ ...formData, officerIncharge: e.target.value })}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Sealing Supervisor</Label>
                <Input
                  value={formData.sealingSupervisor}
                  onChange={e => setFormData({ ...formData, sealingSupervisor: e.target.value })}
                  placeholder="Full name"
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="mb-4 text-lg font-semibold">Distribution Center</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Distribution Code *</Label>
                  <Input
                    value={formData.distCenterCode}
                    onChange={e => setFormData({ ...formData, distCenterCode: e.target.value.toUpperCase() })}
                    placeholder="e.g., DC001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Distribution Center Name</Label>
                  <Input
                    value={formData.distCenterName}
                    onChange={e => setFormData({ ...formData, distCenterName: e.target.value })}
                    placeholder="Distribution center name"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="mb-4 text-lg font-semibold">Examination Session</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Season *</Label>
                  <RadioGroup
                    value={formData.season}
                    onValueChange={v => setFormData({ ...formData, season: v as 'Summer' | 'Winter' })}
                    className="flex gap-6"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Summer" id="summer" />
                      <Label htmlFor="summer" className="cursor-pointer">
                        Summer
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Winter" id="winter" />
                      <Label htmlFor="winter" className="cursor-pointer">
                        Winter
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label>Exam Year *</Label>
                  <select
                    value={formData.examYear}
                    onChange={e => setFormData({ ...formData, examYear: parseInt(e.target.value) })}
                    className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
                    required
                  >
                    {YEARS.map(year => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </CardContent>
          <CardContent className="border-t pt-6">
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
