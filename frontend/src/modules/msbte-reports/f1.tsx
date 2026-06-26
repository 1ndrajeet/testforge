// modules/formats/format1.tsx
'use client';

import React from 'react';

import ReportLayout from '@/components/layout/msbte-report-layout';

export default function Format1Report() {
  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 1',
        subtitle: 'Instructions to Examinees',
      }}
      footer={{ showTimestamp: true }}
      showBackButton
      bordered
      documentTitle="Format_1_Report"
    >
      <div className="times space-y-6 text-sm">
        {/* Page 1 */}
        <div className="page-break-after-always">
          <h3 className="mb-4 text-center text-lg font-bold">Instructions to Examinees</h3>

          <section className="mb-6">
            <h4 className="mb-2 font-bold">A. General Instructions:</h4>
            <ol className="list-decimal space-y-1 pl-6">
              <li>
                The examinee is expected to be present at the examination centre 10 minutes before the commencement of
                examination.
              </li>
              <li>
                No examinee shall be admitted to the examination hall after 30 minutes of commencement of the
                examination.
              </li>
              <li>
                The examinee shall have the proper hall ticket duly signed by Principal / Head of Institute. The valid
                institutional identity card for producing when demanded, without which he/she shall not be eligible to
                appear for the examination.
              </li>
              <li>
                Examinees are not permitted to leave examination hall in the initial 30 minutes and last 10 minutes of
                the paper duration.
              </li>
              <li>
                A bell will be sounded 10 minutes before the commencement of the examination after which the examinees
                are allowed to enter the examination hall/s.
              </li>
              <li>Next ringing of the bell shall announce the commencement of the examination.</li>
              <li>
                A warning bell will be sounded 10 minutes before the close of the examination. Examinees shall tie the
                supplements and enclosures to the main answer book and be ready to hand over it to the invigilator at
                the ringing of the final bell announcing the end of the examination.
              </li>
              <li>
                Exchange of answer books, supplements, calculators, and drawing instruments etc. among the examinees is
                strictly prohibited.
              </li>
              <li>
                Possession of any arms, weapons, etc. in the examination hall or at the examination center by the
                examinee is strictly prohibited.
              </li>
            </ol>
          </section>

          <section className="mb-6">
            <h4 className="mb-2 font-bold">B. Instructions regarding writing answer books:</h4>
            <ol className="list-decimal space-y-1 pl-6">
              <li>
                The examinee shall check the answer book issued to him for loose sheets or improper printing etc. and if
                found so he shall get it changed before commencing to write the answers.
              </li>
              <li>
                The examinee shall enter the requisite information on the face sheet of the answer book properly before
                commencing to write the answers.
              </li>
              <li>
                Start each answer on a fresh page and write question number at the beginning of each answer. Do not
                write anything in the margin of the answer book.
              </li>
              <li>
                Use only blue or black ink pen to write answers. If there is a change in ink, it shall be got attested
                by the supervisor/invigilator.
              </li>
              <li>
                Do not leave blank page/s between the answers. If a page is left blank inadvertently, write “Please Turn
                Over (PTO).” Answers written beyond a blank page may not be assessed.
              </li>
              <li>
                The examinee shall use a separate answer book for each section, where there are sections in the question
                paper.
              </li>
            </ol>
          </section>
        </div>

        {/* Page 2 */}
        <div>
          <section className="mb-6">
            <ol className="list-decimal space-y-1 pl-6" start={7}>
              <li>
                Do not write your name or examination seat no. or any objectionable matter anywhere inside the answer
                book. If any answer requires name or signature, write “XYZ”.
              </li>
              <li>Do not tear off any page from the answer book.</li>
              <li>
                Before submitting, tie securely additional answer book (supplements) and other enclosures, if any, to
                the main answer book. Write the total no. of enclosures (main answer book + graph sheet + drawing sheet
                + supplement if any) attached in the column provided on the cover page of the answer book.
              </li>
            </ol>
          </section>

          <section className="mb-6">
            <h4 className="mb-2 font-bold">C. Special instructions:</h4>
            <ol className="list-decimal space-y-1 pl-6">
              <li>
                The examinee is prohibited from keeping in his possession in the examination hall any blank paper,
                notes, scribbles, chits, book/s, mobile phone, pager, programmable calculator, electronic communication
                devices etc. The violation of this instruction shall attract suitable punitive action.
              </li>
              <li>
                The examinee shall behave properly before, during, or after the examination to maintain the conducive
                environment at the examination center.
              </li>
              <li>
                The examinee found guilty of misbehavior or using or attempting to use unfair means shall be liable for
                suitable punitive action.
              </li>
              <li>
                Discloser of identity on the part of examinee by way of communicating name/seat number/signature or any
                request to the examiner in the answer book is a punishable offence.
              </li>
              <li>
                The examinee is prohibited from taking away the answer book/s or any enclosure/s issued to him out of
                the examination hall. Violation shall attract punitive action under the extant rules.
              </li>
            </ol>
          </section>

          <section>
            <p className="font-bold">
              Important: The instructions to examinee shall be displayed on the notice board of the institute and/or at
              entry places of the examination center, so as to make the examinee fully aware about these instructions
              and their implications.
            </p>
          </section>
        </div>
      </div>

      {/* Print CSS for page break */}
      <style jsx global>{`
        @media print {
          .page-break-after-always {
            page-break-after: always;
          }
        }
      `}</style>
    </ReportLayout>
  );
}
