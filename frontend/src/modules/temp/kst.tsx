"use client";

import React, { JSX, useEffect, useMemo, useRef, useState } from "react";
import {
    FaLinkedinIn,
    FaGraduationCap,
    FaOrcid,
    FaEnvelope,
    FaGlobe,
    FaFileDownload,
    FaBars,
    FaTimes,
} from "react-icons/fa";
import { SiGooglescholar } from "react-icons/si";

/* ============================================================================
   DATA LAYER
   All portfolio content lives here as structured data.
============================================================================ */

interface SocialLink {
    id: string;
    label: string;
    href: string;
    icon: React.ReactNode;
    brandColor: string;
}

interface StatItem {
    id: string;
    value: string;
    label: string;
}

interface NavItem {
    id: string;
    label: string;
    shortLabel?: string;
}

interface EducationItem {
    id: string;
    degree: string;
    institution: string;
    detail: string;
    year: string;
}

interface ExperienceItem {
    id: string;
    role: string;
    organization: string;
    period: string;
    basis?: string;
}

interface ResearchProject {
    id: string;
    title: string;
    funder: string;
    amount: string;
    period: string;
    description: string;
    status: "Ongoing" | "Completed" | "Submitted";
}

interface AwardItem {
    id: string;
    year: string;
    title: string;
    organization: string;
}

type PublicationType = "Journal" | "Conference" | "Patent";

interface Publication {
    id: string;
    year: string;
    authors: string;
    title: string;
    venue: string;
    type: PublicationType;
    doi?: string;
}

interface TextListSection {
    id: string;
    title: string;
    eyebrow: string;
    items: string[];
    intro?: string;
}

const profile = {
    name: "Dr. Kalpana Sunil Thakre",
    formalName: "Dr. Mrs. Kalpana Sunil Thakre",
    title: "HOD, Computer Engineering & Professor",
    qualification: "Ph.D. in Computer Science & Engineering",
    institution: "Marathwada Mitra Mandal College of Engineering, Pune",
    emails: ["kalpana_sunil@yahoo.com", "ksthakre@ieee.org"],
    bioFile: "./assets/short-biography.docx",
    photo: "images/about.jpeg",
    summary:
        "Professor and Head of the Computer Engineering Department with three decades of teaching, research, and academic leadership across video retrieval, machine learning, and database systems. SPPU-recognized Ph.D. guide, published author of 60+ works, and named IEEE, ISTE, and CSI professional member.",
};

const socialLinks: SocialLink[] = [
    {
        id: "orcid",
        label: "ORCID",
        href: "https://orcid.org/0000-0002-8830-9509",
        icon: <FaOrcid />,
        brandColor: "#A6CE39",
    },
    {
        id: "linkedin",
        label: "LinkedIn",
        href: "https://www.linkedin.com/in/dr-kalpana-thakre-1a809616/",
        icon: <FaLinkedinIn />,
        brandColor: "#0A66C2",
    },
    {
        id: "scopus",
        label: "Scopus",
        href: "https://www.scopus.com/authid/detail.uri?authorId=37102832900",
        icon: <FaGraduationCap />,
        brandColor: "#E9711C",
    },
    {
        id: "wos",
        label: "Web of Science",
        href: "https://www.webofscience.com/wos/author/record/Q-9333-2016",
        icon: <FaGlobe />,
        brandColor: "#8B0000",
    },
    {
        id: "scholar",
        label: "Google Scholar",
        href: "https://scholar.google.co.in/citations?user=iY3D3IIAAAAJ",
        icon: <SiGooglescholar />,
        brandColor: "#4285F4",
    },
    {
        id: "email",
        label: "Email",
        href: "mailto:kalpana_sunil@yahoo.com",
        icon: <FaEnvelope />,
        brandColor: "#111111",
    },
];

const navItems: NavItem[] = [
    { id: "home", label: "Overview" },
    { id: "education", label: "Academic Qualification", shortLabel: "Education" },
    { id: "experience", label: "Academic Experience", shortLabel: "Experience" },
    { id: "research-projects", label: "Research Projects" },
    { id: "publications", label: "Publications" },
    { id: "awards", label: "Awards" },
    { id: "pg-ug-guidance", label: "PG / UG Guidance" },
    { id: "pc-member", label: "PC Member / Editor / Reviewer" },
    { id: "university-services", label: "University Services" },
    { id: "courses-taught", label: "Courses Taught" },
    { id: "technical-skills", label: "Technical Skills" },
    { id: "fdp-organized", label: "FDP / Workshops Organized" },
    { id: "expert-lectures", label: "Invited Expert Lectures" },
    { id: "fdp-attended", label: "FDP / SDP / STTP Attended" },
    { id: "area-of-interest", label: "Area of Interest" },
    { id: "achievements", label: "Achievements" },
    { id: "patents", label: "Patents" },
    { id: "research-grants", label: "Research Grants" },
    { id: "research-participation", label: "Research Participation" },
    { id: "professional-membership", label: "Professional Membership" },
    { id: "roles", label: "Roles & Responsibilities" },
];

const stats: StatItem[] = [
    { id: "experience", value: "30+", label: "Years in Academia" },
    { id: "publications", value: "60+", label: "Publications" },
    { id: "patents", value: "3", label: "Patents Filed" },
    { id: "grants", value: "4", label: "Research Grants" },
    { id: "students", value: "90+", label: "Students Guided" },
    { id: "phd", value: "6", label: "Current Ph.D. Scholars" },
];

const education: EducationItem[] = [
    {
        id: "phd",
        degree: "Ph.D., Computer Science & Engineering",
        institution:
            "Shri Ramanand Tirth Marathwada University, Nanded — research carried out at Shri Guru Govind Singh Institute of Engineering & Technology and MGM's College of Engineering, Nanded",
        detail: "Awarded 1 February 2016",
        year: "2016",
    },
    {
        id: "mtech",
        degree: "M.Tech., Computer Science & Engineering",
        institution: "G. H. Raisoni College of Engineering, Nagpur University",
        detail: "First Division",
        year: "2006",
    },
    {
        id: "be",
        degree: "B.E., Computer Technology",
        institution: "KaviKulguru Institute of Science and Technology, Ramtek, Nagpur",
        detail: "First Division",
        year: "1993",
    },
    {
        id: "hssc",
        degree: "HSSC",
        institution: "Shri Samarth Junior College of Science, Ramtek, Nagpur",
        detail: "First Division",
        year: "1989",
    },
    {
        id: "ssc",
        degree: "SSC",
        institution: "Shriram Kanya Vidyalaya, Ramtek, Nagpur",
        detail: "First Division",
        year: "1987",
    },
];

const experience: ExperienceItem[] = [
    {
        id: "mmcoe-hod",
        role: "Professor & Head of Department, Computer Engineering",
        organization: "Marathwada Mitra Mandal College of Engineering, Pune",
        period: "24 Jan 2022 — Present",
    },
    {
        id: "scoe-prof",
        role: "Professor, Department of Information Technology",
        organization: "Sinhgad College of Engineering (Vadgaon Bk.), Pune",
        period: "Feb 2016 — Present",
        basis: "Regular basis",
    },
    {
        id: "scoe-assoc",
        role: "Associate Professor, Department of Information Technology",
        organization: "Sinhgad College of Engineering (Vadgaon Bk.), Pune",
        period: "10 Oct 2007 — 24 Jan 2022",
        basis: "Regular basis",
    },
    {
        id: "ghr-asst",
        role: "Assistant Professor, Department of Computer Science & Engineering",
        organization: "G. H. Raisoni College of Engineering, Nagpur",
        period: "15 Sept 2006 — 1 Oct 2007",
        basis: "Regular basis",
    },
    {
        id: "pcea-lect-reg",
        role: "Lecturer, Department of Computer Technology",
        organization: "Priyadarshini College of Engineering and Architecture, Nagpur",
        period: "16 Aug 1999 — 10 Sept 2006",
        basis: "Regular basis",
    },
    {
        id: "pcea-lect-adhoc",
        role: "Lecturer, Department of Computer Technology",
        organization: "Priyadarshini College of Engineering and Architecture, Nagpur",
        period: "24 Jul 1996 — 25 May 1999",
        basis: "Adhoc basis",
    },
    {
        id: "kits-lect",
        role: "Lecturer, Department of Computer Technology",
        organization: "KaviKulguru Institute of Science and Technology, Ramtek, Nagpur",
        period: "13 Sept 1994 — 15 Mar 1996",
        basis: "Adhoc basis",
    },
    {
        id: "sntc-lect",
        role: "Lecturer, Department of Computer Engineering",
        organization: "Shri Narendra Tidke College of Arts and Commerce, Ramtek, Nagpur",
        period: "Jul 1993 — Jul 1994",
        basis: "Adhoc basis",
    },
];

const researchProjects: ResearchProject[] = [
    {
        id: "aspire",
        title:
            "Semantic Analysis System for Human Resource Management Department using Facial Emotion Recognition",
        funder: "SPPU — ASPIRE Scheme",
        amount: "₹6,27,000",
        period: "2018-19",
        description: "Research proposal in pipeline for the stated grant amount.",
        status: "Submitted",
    },
    {
        id: "bcud-2016",
        title:
            "Flexible Video Surveillance and Retrieval of Content-Based Video using Moving Object Detection",
        funder: "BCUD, Pune",
        amount: "₹53,000",
        period: "2016-18",
        description: "Research proposal submitted to and funded by BCUD, Pune.",
        status: "Completed",
    },
    {
        id: "bcud-2010",
        title: "Content-Based Video Retrieval System: An Application to the Education Field",
        funder: "BCUD, Pune",
        amount: "₹2,00,000",
        period: "2010-12",
        description: "Research proposal submitted to and funded by BCUD, Pune.",
        status: "Completed",
    },
    {
        id: "aicte-2017",
        title: "Summer / Winter School on Information Retrieval",
        funder: "AICTE",
        amount: "—",
        period: "2017",
        description: "Proposal submitted to AICTE; in further progress.",
        status: "Ongoing",
    },
];

const awards: AwardItem[] = [
    {
        id: "uttam-adhyapika",
        year: "2021",
        title: "Uttam Adhyapika Award",
        organization: "Bharat Education Excellence Awards, Education & Research",
    },
    {
        id: "pcocare-best-paper",
        year: "2020",
        title: 'Best Paper Award — "PCOcare: PCOS Detection and Prediction using Machine Learning Algorithms"',
        organization: "ICIDC-2020, Helix Scientific Publisher",
    },
    {
        id: "viwa",
        year: "2018",
        title: "VIWA Award — Distinguished Women in Information Technology",
        organization: "VIWA",
    },
    {
        id: "video-partition-best-paper",
        year: "2015",
        title:
            'Best Paper Award (Ph.D. Category) — "Video Partitioning and Secured Keyframe Extraction of MPEG Video"',
        organization:
            "1st International Conference on Information Security & Privacy, Procedia Computer Science, Elsevier",
    },
];

const patents: Publication[] = [
    {
        id: "patent-skincare",
        year: "2021",
        authors: "Narsimha Banothu, Kalpana Sunil Thakare",
        title: "Optimised Skin Care Product Recommendation System based on SVM-based Machine Learning",
        venue: "Indian Patent Office Journal · Application No. 202141035032 A",
        type: "Patent",
    },
    {
        id: "patent-social-delusion",
        year: "2017",
        authors: "Dipali Dawande, K. S. Thakre",
        title: "Identifying Social Network Delusion to Investigate Addiction Ratio by Mining Social Media Data",
        venue: "Indian Patent Office Journal · Application ID 201721027114",
        type: "Patent",
    },
    {
        id: "patent-anomaly",
        year: "2017",
        authors: "Sujeet Suryavanshi, Kalpana Thakre",
        title: "Online Anomaly Detection based on Ensemble of Heterogeneous Classifiers",
        venue: "Indian Patent Journal · Application No. 201721035142",
        type: "Patent",
    },
];

const journals: Publication[] = [
    {
        id: "j-2022",
        year: "2022",
        authors: "Umadevi, K.S., Thakare, K.S., Patil, S., et al., Dwivedi, A.K., Haldorai, A.",
        title: "Dynamic Hidden Feature Space Detection of Noisy Image Set by Weight Binarization",
        venue: "Signal, Image and Video Processing",
        type: "Journal",
    },
    {
        id: "j-pcocare",
        year: "2020",
        authors: "Vaidehi Thakre, Shreyas Vedpathak, Kalpana Thakre",
        title: "PCOcare: PCOS Detection and Prediction using Machine Learning Algorithms",
        venue: "Bioscience Biotechnology Research Communications, Vol. 13(12) · Web of Science",
        type: "Journal",
    },
    {
        id: "j-heart",
        year: "2020",
        authors: "K. S. Thakre, Viraj Varale",
        title: "Prediction of Heart Disease using Machine Learning Algorithm",
        venue: "Bioscience Biotechnology Research Communications, Vol. 13(12) · Web of Science",
        type: "Journal",
    },
    {
        id: "j-social-delusion",
        year: "2020",
        authors: "K. S. Thakre, Deepali Dawande, Vaidehi Thakre",
        title: "Identifying Social Network Delusion to Investigate Addiction Ratio using Data Mining",
        venue: "ACM Digital Library · ISBN 978-1-4503-7685-3",
        type: "Journal",
    },
    {
        id: "j-community-qa",
        year: "2020",
        authors: "Sayali Sonawane, K.S. Thakare, Vaishnavi Kolte, Pranita Jejurkar, Ashwini Dhavare",
        title: "Predicting Best Answer in Community Question",
        venue: "Test Engineering and Management Journal, Vol. 83 · ISSN 0193-4120",
        type: "Journal",
    },
    {
        id: "j-elearning",
        year: "2020",
        authors: "Vaibhavi Pawar, K.S. Thakre, Abhishek Pujari, Pranali Wagh, Yash Pawar",
        title: "E-learning on Cloud using Advanced Encryption Standard",
        venue: "International Journal of Embedded Systems and Emerging Technologies, 6(1), 17–27",
        type: "Journal",
    },
    {
        id: "j-mmdata",
        year: "2017",
        authors: "Prachi Kohade, K. S. Thakare",
        title: "Multimedia Data Mining — A Survey",
        venue:
            "International Journal of Innovative Research in Computer and Communication Engineering, Vol. 5(12)",
        type: "Journal",
        doi: "10.15680/IJIRCCE.2017.0512057",
    },
    {
        id: "j-online-exam-survey",
        year: "2018",
        authors: "Nikita Modi, Neeral Bhalgat, K. S. Thakare",
        title: "Online Examination System: A Survey",
        venue: "CiiT International Journal of Software Engineering and Technology, Vol. 10, No. 6",
        type: "Journal",
    },
    {
        id: "j-shot-boundary",
        year: "2016",
        authors: "K. S. Thakre, A. M. Rajurkar",
        title: "Shot Boundary Detection of MPEG Video using Biorthogonal Wavelet Transform",
        venue: "International Journal of Pure and Applied Mathematics, Vol. 118, No. 7, 405–413",
        type: "Journal",
    },
    {
        id: "j-video-partition",
        year: "2016",
        authors: "K. S. Thakre, A. M. Rajurkar, R. R. Manthalkar",
        title: "Video Partitioning and Secured Keyframe Extraction of MPEG Video",
        venue: "Procedia Computer Science, Vol. 78, 790–798 · Elsevier · Scopus",
        type: "Journal",
        doi: "10.1016/j.procs.2016.02.058",
    },
    {
        id: "j-mining-social-media",
        year: "2016",
        authors: "Dipali R. Dawande, K.S. Thakre",
        title: "Mining Online Social Media Data: A Survey",
        venue: "International Journal of Applied Engineering and Technology, Vol. 6(4), 1–8",
        type: "Journal",
    },
    {
        id: "j-network-anomaly",
        year: "2017",
        authors: "Sujeet Raosaheb Suryawanshi, Kalpana Thakre",
        title: "Network Anomaly Detection System Using Machine Learning Technique: A Proposed Model",
        venue: "International Journal of Applied Engineering and Technology, Vol. 7(1), 32–40",
        type: "Journal",
    },
    {
        id: "j-cbvr-lsi",
        year: "2012",
        authors: "Kalpana S. Thakare, Archana M. Rajurkar, R. R. Manthalkar",
        title: "Content-Based Video Retrieval using Latent Semantic Indexing and Color, Motion and Edge Features",
        venue: "International Journal of Computer Applications, 54(12), 42–48",
        type: "Journal",
        doi: "10.5120/8621-2486",
    },
    {
        id: "j-spatiotemporal",
        year: "2011",
        authors: "Kalpana S. Thakre, Archana M. Rajurkar, R. R. Manthalkar",
        title:
            "A Comprehensive System Based on Spatiotemporal Features such as Motion, Quantized Color and Edge Features",
        venue: "International Journal of Wireless and Microwave Technologies, Vol. 1, No. 3",
        type: "Journal",
        doi: "10.5815/ijwmt",
    },
    {
        id: "j-effective-cbvr",
        year: "2011",
        authors: "Kalpana S. Thakre, Archana M. Rajurkar, R. R. Manthalkar",
        title: "An Effective CBVR System based on Motion, Quantized Color and Edge Density Features",
        venue: "International Journal of Computer Science & Information Technology, Vol. 3, No. 2",
        type: "Journal",
        doi: "10.5121/ijcsit.2011.3206",
    },
    {
        id: "j-singing-humming",
        year: "2015",
        authors: "Vyankatesh Kharat, Kalpana Thakare",
        title: "A Survey on Query by Singing / Humming",
        venue: "International Journal of Computer Applications, Vol. 111, No. 14, 39–42",
        type: "Journal",
    },
    {
        id: "j-text-extraction",
        year: "2013",
        authors: "Suvarna Baheti, K.S. Thakare",
        title: "A Novel Based Text Extraction, Recognition from Digital E-Videos",
        venue: "International Journal of Innovative Research in Computer and Communication Engineering, Vol. 1(5)",
        type: "Journal",
    },
    {
        id: "j-visual-crypto",
        year: "2014",
        authors: "Nagesh Soradge, K. S. Thakare",
        title: "A Short Review on Various Visual Cryptography Schemes",
        venue: "International Journal of Computer Science and Business Informatics, Vol. 12",
        type: "Journal",
    },
    {
        id: "j-shot-boundary-review",
        year: "2014",
        authors: "Arun Hattarge, K.S. Thakare",
        title: "Analysis and Review of Formal Approaches to Automatic Video Shot Boundary Detection",
        venue: "International Journal of Advanced Research in Computer and Communication Engineering, Vol. 3(1)",
        type: "Journal",
    },
    {
        id: "j-invariant-moments",
        year: "2011",
        authors: "Kalpana Thakre, Meenakshi Thalor",
        title: "Video Retrieval System using Invariant Moments",
        venue: "International Journal on Computer Science and Application, Sinhgad IBAR, Kondhwa",
        type: "Journal",
    },
    {
        id: "j-video-streaming",
        year: "2010",
        authors: "Nitin Talhar, Kalpana Thakre",
        title:
            "Video Streaming Techniques for Reliable Video Conferencing Application over Communication Framework Architecture",
        venue: "International Journal of Computer Science and Application (ITCSA-2010)",
        type: "Journal",
    },
    {
        id: "j-video-match",
        year: "2010",
        authors: "Shimna Balkrishnan, Kalpana Thakre",
        title: "Video Match Analysis: A Comprehensive Content-Based Video Retrieval System",
        venue: "International Journal of Computer Science and Application (ITCSA-2010)",
        type: "Journal",
    },
];

const conferences: Publication[] = [
    {
        id: "c-pcocare",
        year: "2020",
        authors: "Vaidehi Thakre, Shreyas Vedpathak, Kalpana Thakre",
        title: "PCOcare: PCOS Detection and Prediction using Machine Learning Algorithms",
        venue: "ICIDC-2020, Helix Scientific Publisher",
        type: "Conference",
    },
    {
        id: "c-heart",
        year: "2020",
        authors: "K. S. Thakre, Viraj Varale",
        title: "Prediction of Heart Disease using Machine Learning Algorithm",
        venue: "ICIDC-2020, Helix Scientific Publisher",
        type: "Conference",
    },
    {
        id: "c-elearning-aes",
        year: "2020",
        authors: "Vaibhavi Pawar, Yash Pawar, Pranali Wagh, Abhishek Pujari, K. S. Thakre",
        title: "E-learning on Cloud using Advanced Encryption Standards",
        venue: "ICPC 2020 — International Conference on Pervasive Computing",
        type: "Conference",
    },
    {
        id: "c-cross-media",
        year: "2018",
        authors: "Prachi Kohade, K. S. Thakare",
        title: "Cross Media Retrieval using Mixed Generative Hashing Method",
        venue: "iPGCON 2018, 9th PG Conference of Information Technology",
        type: "Conference",
    },
    {
        id: "c-online-exam-adaptive",
        year: "2018",
        authors: "Tanvi Mehta, Simran Jain, K. S. Thakare",
        title: "Android and Web-based Online Examination System using Smart Adaptive Algorithms",
        venue: "IC3SE 2018, Zeal College of Engineering and Research, Pune",
        type: "Conference",
    },
    {
        id: "c-online-exam-survey",
        year: "2018",
        authors: "Nikita Modi, Neeral Bhalgat, K. S. Thakare",
        title: "Online Examination System: A Survey",
        venue: "NCPC 2018, Sinhgad College of Engineering, Pune",
        type: "Conference",
    },
    {
        id: "c-social-delusion",
        year: "2017",
        authors: "Dipali R. Dawande, K.S. Thakre",
        title: "Identifying Social Network Delusion to Investigate Addiction Ratio by Mining Social Media Data",
        venue: "iPGCON-2017, 8th PG Conference of Information Technology",
        type: "Conference",
    },
    {
        id: "c-nsl-kdd",
        year: "2017",
        authors: "Sujeet Raosaheb Suryawanshi, Kalpana Thakre",
        title:
            "Experimenting with NSL-KDD Cup 99 Dataset for Anomaly Detection using Machine Learning Technique: Random Forest",
        venue: "iPGCON-2017, 8th PG Conference of Information Technology",
        type: "Conference",
    },
    {
        id: "c-text-preprocessing",
        year: "2017",
        authors: "Dipali R. Dawande, K.S. Thakre",
        title: "Text Preprocessing for Social Data Analysis",
        venue: "NCRTACCS-2017",
        type: "Conference",
    },
    {
        id: "c-network-anomaly-model",
        year: "2017",
        authors: "Sujeet Raosaheb Suryawanshi, Kalpana Thakre",
        title: "Network Anomaly Detection System using Machine Learning Technique: A Proposed Model",
        venue: "NCRTACCS-2017",
        type: "Conference",
    },
    {
        id: "c-video-partition-elsevier",
        year: "2015",
        authors: "Kalpana S. Thakare, Archana M. Rajurkar, Ramchandra Manthalkar",
        title: "Video Partitioning and Secured Keyframe Extraction of MPEG Video",
        venue:
            "1st International Conference on Information Security & Privacy, Procedia Computer Science, Elsevier",
        type: "Conference",
    },
    {
        id: "c-singing-humming-ranking",
        year: "2015",
        authors: "Vyankatesh Kharat, Kalpana Thakare",
        title: "Productive Outcome Ranking for Mobile Query by Singing / Humming",
        venue: "IPGCON-2015, University of Pune, Amrutvahini College of Engg., Sangamner",
        type: "Conference",
    },
    {
        id: "c-forest-fire-auth",
        year: "2015",
        authors: "Anwaya Patil, Kalpana Thakare, Kishor Sadafale",
        title: "Securing Real Social Authentication System from Forest Fire Attacks",
        venue: "IPGCON-2015, University of Pune, Amrutvahini College of Engg., Sangamner",
        type: "Conference",
    },
    {
        id: "c-social-trustee",
        year: "2015",
        authors: "Anwaya Patil, Kalpana Thakare, Kishor Sadafale",
        title: "A Survey on Real Social Trustee Based Authentication",
        venue: "NCTR, Vol. 7, Issue 1, Anantrao Pawar College of Engg. & Research, Pune",
        type: "Conference",
    },
    {
        id: "c-cbvr-personalization",
        year: "2015",
        authors: "Pradeep Chivadshetty, Kishor Sadafale, Kalpana Thakre",
        title: "Content-Based Video Retrieval using Integrated Feature Extraction and Personalization Results",
        venue: "IEEE ICIP 2015",
        type: "Conference",
        doi: "10.1109/INFOP.2015.7489372",
    },
    {
        id: "c-anti-phishing",
        year: "2014",
        authors: "Nagesh Soradge, K. S. Thakare",
        title: "A Novel Anti-Phishing Framework on Cloud based on Visual Cryptography",
        venue: "12th IRF International Conference, Pune",
        type: "Conference",
    },
    {
        id: "c-cbvr-svd",
        year: "2012",
        authors: "Kalpana S. Thakare, Archana M. Rajurkar, R. R. Manthalkar",
        title: "Content-Based Video Retrieval using Latent Semantic Indexing and Singular Value Decomposition",
        venue: "ICCICT-2012, Sardar Vallabhbhai College of Engineering, Mumbai · IEEE",
        type: "Conference",
        doi: "10.1109/ICCICT.2012.6398229",
    },
    {
        id: "c-text-extraction-video",
        year: "2013",
        authors: "Kalpana S. Thakare, Suwarna Baheti",
        title: "A Key Feature as Text Extraction from Video",
        venue: "IEEE International Conference Advances in Research Engineering and Technology, KL University",
        type: "Conference",
    },
    {
        id: "c-football-events",
        year: "2011",
        authors: "B.S. Khade, K.S. Thakre",
        title: "A Hierarchical Framework for Event Detection and Classification in Football Sports Video",
        venue: "iCOST 2011, SSVPS B.S. Deore College of Engineering, Dhule",
        type: "Conference",
    },
    {
        id: "c-closeup-soccer",
        year: "2011",
        authors: "B.S. Khade, K.S. Thakre",
        title: "Close-up Detection based on Feature Analysis and Edge Detection for Soccer Video",
        venue: "INCON 2011, ASM Group of Institutes, Pune",
        type: "Conference",
    },
    {
        id: "c-color-feature-integration",
        year: "2011",
        authors: "Kalpana Thakre, Meenakshi Tholar",
        title: "Integration of Color Feature Extraction Methods in Video Search System",
        venue: "International Conference on Intelligent Systems and Data Processing, Gujarat",
        type: "Conference",
    },
    {
        id: "c-color-texture-integration",
        year: "2011",
        authors: "—",
        title: "Video Retrieval System using Integration of Color and Texture Feature Extraction Methods",
        venue: "Ongoing Research in Management and IT, ASM Group of Institutes",
        type: "Conference",
    },
    {
        id: "c-video-segmentation-novel",
        year: "2012",
        authors: "Kalpana S. Thakre, Archana M. Rajurkar, R. R. Manthalkar",
        title: "A Novel Approach to Video Segmentation for Video Data Organization and Retrieval",
        venue: "NCIPET-2012",
        type: "Conference",
    },
    {
        id: "c-hierarchical-event-1",
        year: "2010",
        authors: "B.S. Khade, K.S. Thakre",
        title: "Algorithms for Hierarchical Event Detection and Classification for Video",
        venue: "NCPC 2010, SCOE Pune",
        type: "Conference",
    },
    {
        id: "c-comprehensive-cbvr",
        year: "2011",
        authors: "Kalpana S. Thakre, Archana M. Rajurkar",
        title: "A Comprehensive CBVR System based on Spatiotemporal Features",
        venue: "NSWCTC 2011, Wuhan, China · IEEE",
        type: "Conference",
    },
    {
        id: "c-effective-cbvr-conf",
        year: "2010",
        authors: "Kalpana S. Thakre, Archana M. Rajurkar, R. R. Manthalkar",
        title: "An Effective CBVR System based on Motion, Quantized Color and Edge Density Features",
        venue: "IITM '10, ACM, New York",
        type: "Conference",
        doi: "10.1145/1963564.1963589",
    },
    {
        id: "c-cbir-medical-review",
        year: "2010",
        authors: "Kalpana S. Thakre, Archana M. Rajurkar",
        title: "CBIR / CBVR in Medical Applications: A Critical Review",
        venue: "1st IFIP International Conference on Bioinformatics, SVNIT, Surat",
        type: "Conference",
    },
    {
        id: "c-video-segmentation-review",
        year: "2010",
        authors: "Kalpana S. Thakre, Archana M. Rajurkar",
        title: "Video Segmentation and Identification in Compressed Domain: A Review",
        venue: "ICEI2K10, Panjab",
        type: "Conference",
    },
    {
        id: "c-cbir-medical-app",
        year: "2010",
        authors: "Smita Sakhare, Kalpana Thakre",
        title: "CBIR System: A Medical Application",
        venue: "National Conference on Pervasive Computing",
        type: "Conference",
    },
    {
        id: "c-hierarchical-event-2",
        year: "2010",
        authors: "Beena Khade, Kalpana Thakre",
        title: "Algorithms for Hierarchical Event Detection and Classification for Video",
        venue: "NCPC 2010, SCOE Pune",
        type: "Conference",
    },
    {
        id: "c-football-events-2",
        year: "2011",
        authors: "Beena Khade, Kalpana Thakre",
        title: "A Hierarchical Framework for Event Detection and Classification in Football Sports Video",
        venue: "iCOST 2011, SSVPS B.S. Deore College of Engineering, Dhule",
        type: "Conference",
    },
    {
        id: "c-closeup-soccer-2",
        year: "2011",
        authors: "Beena Khade, Kalpana Thakre",
        title: "Close-up Detection based on Feature Analysis and Edge Detection for Soccer Video",
        venue: "INCON 2011, ASM Group of Institutes, Pune",
        type: "Conference",
    },
    {
        id: "c-video-streaming-isccc",
        year: "2009",
        authors: "Nitin Talhar, Kalpana Thakre",
        title:
            "Video Streaming Techniques for Reliable Video Conferencing Application over Communication Framework Architecture",
        venue: "ISCCC 2009, Singapore",
        type: "Conference",
    },
    {
        id: "c-video-segmentation-indexing",
        year: "2008",
        authors: "Kalpana Thakre, Sonali Potdar",
        title: "Video Segmentation and Indexing in Compressed Domain: A Critical Review",
        venue: "ICEMC2-2008, Infosys, Mysore",
        type: "Conference",
    },
    {
        id: "c-iris-low-far",
        year: "2007",
        authors: "Archana Mire, Kalpana Thakre",
        title: "Iris Recognition with Low False Acceptance Rate using Low Threshold Histogram Analysis",
        venue: "IICT-2007, Dehradun Institute of Technology",
        type: "Conference",
    },
    {
        id: "c-iris-recognition",
        year: "2007",
        authors: "Archana Mire, Kalpana Thakre",
        title: "Iris Recognition",
        venue: "NCET-2007, Institute of Technology and Science, Ghaziabad",
        type: "Conference",
    },
    {
        id: "c-cbir-color-shape",
        year: "2006",
        authors: "Kalpana Thakre, Preeti Vodital",
        title: "Content-Based Image Retrieval using Color and Shape",
        venue: "IFToMM-2006, PCEA, Nagpur",
        type: "Conference",
    },
];

const publications: Publication[] = [...patents, ...journals, ...conferences];

const pgUgProjects: string[] = [
    "Network anomaly detection system using machine learning algorithms",
    "Identifying social delusion to investigate addiction ratio by mining social data",
    "Mining social media data for understanding students' learning experiences",
    "Productive outcome ranking for mobile query by singing and humming",
    "Securing real social authentication",
    "A novel anti-phishing framework on cloud based on visual cryptography",
    "Performance evaluation of shot boundary detection algorithms",
    "Performance evaluation of video retrieval techniques",
    "Hierarchical event detection and classification for outdoor sports",
    "Sandboxing of suspicious Android software via static and dynamic analysis",
    "Novel e-learning approach using video segmentation",
    "Video Match: a video retrieval system",
    "Real-time, object-based video streaming for communication systems",
];

const pcMemberRoles: string[] = [
    "Reviewer, APIT-2021, Bangkok, Thailand",
    "Reviewer, ICIDC-2020, Nagpur (27–28 Nov 2020)",
    "Speaker, APIT-2020, Bali, Indonesia",
    "Technical Co-Chair, ICPC-2020, SCOE, Pune",
    "Session Chair, ICCET 2020, MGM COE, Nanded",
    "Reviewer, IEEE Access, IEEE Digital Library (Jan 2020)",
    "External Examiner / Panel Member, Ph.D. Examination, MIT WPU, Kothrud",
    'Resource Person, "G Suite Components", Sant Gadge Baba Amravati University (Jun 2020)',
    "Judge, Tech-Pro International Project Competition, MIT Aurangabad (Jun 2020)",
    "TPC Member, IEEE INDIACom-2019, Mumbai",
    "PC Member & Reviewer, Springer 2nd Int'l Conf. on Image Processing & Pattern Recognition, 2018",
    "Reviewer, Journal of Engineering Science and Technology, Taylor's University (Scopus, 2018)",
    "Reviewer & Session Chair, Springer ICICC-2017, MIT, Pune",
    "Reviewer, IEEE ICISIM-2017, JNEC Aurangabad",
    "Registered Reviewer, International Journal for IJDBTM, Inderscience Publications (2016)",
    "Reviewer, ICCUBEA-2016, Pune (IEEE Digital Explore)",
    "Reviewer, Fuzzy Systems and Data Mining (FSDM-2017), Malaysia",
    "Reviewer & Session Chair, ICUC-2017, SCOE, Pune",
    "Session Chair & Reviewer, 7th iPGCON-2017, PCCOE, Pune",
    "Session Chair & Reviewer, 7th iPGCON-2016, SCOE, Pune",
    "Reviewer, RICE-2016, Nagpur (McGraw-Hill Publication)",
    "Chair of Session, ICISP-2015, Nagpur (McGraw-Hill Publication)",
    "Reviewer, ICCUBEA 2015, Pune (IEEE Digital Explore)",
    'Best Paper Award, "Video Partitioning and Secured Keyframe Extraction", ICISP-2015, Nagpur',
];

const universityServices: string[] = [
    "Approved Ph.D. Guide, Savitribai Phule Pune University (SPPU)",
    "Chairman & paper setter — DBMS, BAI, Multimedia Technology (2018–2021)",
    "Asst. CAP Director, In-Sem Examination, SCOE, Pune (Aug 2017)",
    "Chairman, Database Management System & Software Laboratory-VI, BOS Pune",
    "External Senior Supervisor, Winter Examination 2016, JSPM Rajarshi Sahu College of Engineering",
    "Internal Senior Supervisor, Winter Examination 2016, Sinhgad College of Engineering, Vadgaon",
    "Chairman, Third Year Engineering — Multimedia Technologies (2012 Course)",
    "Paper setting, PG — Applied Algorithm (2008 Course)",
    "Paper setting, PG — Advanced Database Systems (2012 Course)",
    "Paper setting, UG — Database Management System (2008 Course)",
    "Paper setting, UG — Multimedia Technologies (2012 Course)",
    "Paper setting, UG — Management Information System (2008 Course)",
    "Paper assessment, PG — Applied Algorithm (2008 Course)",
    "Paper assessment, PG — Advanced Database Systems (2012 Course)",
    "Paper assessment, UG — Database Management System (2008 Course)",
    "Paper assessment, UG — Multimedia Technologies (2012 Course)",
    "Paper assessment, UG — Management Information System (2008 Course)",
    "Senior Supervisor, Winter Examination 2014, Cummins College of Engineering",
    "Coordinator, In-Semester CAP, Semester 1 (2014-15)",
];

const coursesUG: string[] = [
    "Database Management Systems",
    "Data Mining and Warehousing",
    "Design and Analysis of Algorithms",
    "Artificial Intelligence",
    "Neural Networks and Expert Systems",
    "Software Architecture",
    "Management Information Systems",
    "Advanced Database Management Systems",
];

const coursesPG: string[] = [
    "Applied Algorithms",
    "Advanced Distributed Systems",
    "Business Analytics and Intelligence",
];

const technicalSkills: string[] = [
    "C++",
    "Java",
    "Oracle",
    "MySQL",
    "MongoDB",
    "Cassandra",
    "Amazon DynamoDB",
    "Visual Basic",
    "Python",
];

const fdpOrganized: string[] = [
    "International Conference on Pervasive Computing (ICPC-2020), SCOE, Pune (13–14 Feb 2020)",
    'One-day workshop, "Project Design using MySQL/JAVA", SCOE (Sep 2019, ~100 students)',
    'One-day workshop, "Project Design using MongoDB/JAVA", SCOE (Oct 2018, ~98 students)',
    "International Conference on Ubiquitous Computing (ICUC-2017), SCOE, Pune (21–22 Jul 2017)",
    "Post Graduate Conference in coordination with SPPU, SCOE (Feb 2016)",
    'One-day workshop, "Android Application Development and Basics", SCOE (Mar 2016, ~100 students)',
    'One-day workshop, "Project Design using MongoDB/JAVA", SCOE (Sep 2016, ~100 students)',
    'Guest lecture, "Multimedia Technologies: 3D Animation" (Mar 2016, ~100 attendees)',
    "Two-day FDP with BOS (IT), Pune University — Elective-III Software Lab V & VI (Dec 2015, ~140 attendees)",
    'Two-day workshop, "Internet Security and Ethical Hacking", SCOE (Feb 2014, ~80 attendees)',
    'One-day workshop, "Project Design using MongoDB/JAVA", SCOE (Sep 2015, ~110 students)',
    'One-day workshop, "Project Design using MongoDB/JAVA", SCOE (Sep 2014, ~90 students)',
    'One-day workshop, "Oracle / VB.NET", SCOE (Jul 2013)',
    "Organizing committee member, iPGCON'11 Conference, Dept. of IT (Apr 2011)",
];

const expertLectures: string[] = [
    "Resource person, Advanced Databases session, PICT (Jan 2022)",
    'Resource person, "Demo — POJO Class", STES training placement cell (Jan 2021)',
    "Speaker, APIT-2020, Bali, Indonesia",
    'Resource person, "G Suite Components", Sant Gadge Baba Amravati University (Jun 2020)',
    'Resource person, "GATE — Exam Database Systems", STES training placement cell (Apr 2020)',
    "Guest speaker, DBMS syllabus & lab (SL-VI), Maharshi Karve Cummins College of Engineering (Mar 2017)",
    'Trainer, 4-day FDP "Train the Trainer" on Database Management Systems (Jun 2016)',
    "Guest lecture, Video Processing, G. H. Raisoni College of Engineering, Nagpur (Jun 2015, PG)",
    "Guest lecture, Distributed Databases: Query Processing, RMD Sinhgad College of Engineering (Mar 2014, PG)",
    "Guest lecture, Normalization of Databases and Project Design, RMD Sinhgad College of Engineering (Feb 2014, UG)",
    'Lecture, Database Management System, "Train the Trainer" FDP, Sinhgad Institute of Technology, Lonavala',
    "Lecture, Feature Extraction of Color Images, FDP on Information Retrieval, Dept. of IT, SCOE, Vadgaon",
];

const fdpAttended: string[] = [
    "One-week FDP, R-Language for Analytics Data Science, SCOE / IIT Bombay Chapter (Apr–May 2020)",
    "One-week FDP, Research Methodology and Tools, Sandip Institute of Technology, Nashik (May 2020)",
    "One-week FDP, Recent Trends in Database Technology, ACM Chapter & Shri Ramdeobaba College of Engineering, Nagpur (Jun 2020)",
    "Two-week STTP (ISTE), Advanced Materials and Latest Trends in Computer Technology, PCEA, Nagpur (Oct–Nov 2001)",
    "Two-week STTP (ISTE), Mechatronics and Its Industrial Exposure to IT Industry, PCEA, Nagpur (Oct 2001)",
    "One-week STTP (AICTE-ISTE), GNU/Linux at Work, PCEA, Nagpur (May 2004)",
    "FDP (TEQIP), Distributed Systems and Information Retrieval, SCOE, Pune (Feb 2012)",
    "One-week training, Microsoft Technologies, Persistent Systems Ltd. (Jun 2008)",
    "Four-day training, OOAD using UML with Rational Software Architect, IBM Software Education Ltd. (Oct 2009)",
    "Three-day training, GOF Design Patterns: Software Architecture, Persistent Systems Ltd. (Sep 2015)",
    "Two-day FDP, Big Data and Business Intelligence, Persistent Systems Ltd. (Jun 2012)",
    "One-day FDP, Database Management System, JSPM's RSCOE (Jul 2014)",
    "One-day workshop, Restructuring of TE-IT Syllabus 2008 Course, PCCCOE, Pune (Feb 2010)",
];

const areasOfInterest: string[] = [
    "Advanced Databases",
    "NoSQL Databases",
    "Business Analytics & Intelligence",
    "Data Science & Data Mining",
    "Advanced Algorithms",
    "Machine Learning",
    "Image / Video Processing & Retrieval",
];

const achievements: string[] = [
    "VIWA-2018 Award — Distinguished Women in Information Technology",
    'Best Paper Award (Ph.D. Category) — "Video Partitioning and Secured Keyframe Extraction of MPEG Video", 1st International Conference on Information Security & Privacy, Procedia Computer Science, Elsevier, 2015',
];

const researchGrants: string[] = [
    'SPPU — ASPIRE Scheme: ₹6,27,000 proposal (2018-19) — "Semantic Analysis System for HR Dept. using Facial Emotion Recognition"',
    'BCUD, Pune: ₹53,000 grant (2016-18) — "Flexible Video Surveillance and Retrieval of Content-Based Video using Moving Object Detection"',
    'BCUD, Pune: ₹2,00,000 grant (2010-12) — "Content-Based Video Retrieval System: An Application to the Education Field"',
    "AICTE: Summer/Winter School proposal on Information Retrieval (2017), in progress",
];

const researchParticipation: string[] = [
    "TPC Member, IEEE INDIACom-2019, Mumbai",
    "PC Member & Reviewer, Springer 2nd Int'l Conf. on Image Processing & Pattern Recognition, 2018",
    "Reviewer, Journal of Engineering Science and Technology, Taylor's University (Scopus, 2018)",
    "Reviewer & Session Chair, Springer ICICC-2017, MIT, Pune",
    "Reviewer, IEEE ICISIM-2017, JNEC Aurangabad",
    "Registered Reviewer, IJDBTM, Inderscience Publications (2016)",
    "Reviewer, ICCUBEA-2016, Pune (IEEE Digital Explore)",
    "Reviewer, Fuzzy Systems and Data Mining (FSDM-2017), Malaysia",
    "Reviewer & Session Chair, ICUC-2017, SCOE, Pune",
    "Session Chair & Reviewer, 7th iPGCON-2017, PCCOE, Pune",
    "Session Chair & Reviewer, 7th iPGCON-2016, SCOE, Pune",
    "Reviewer, RICE-2016, Nagpur (McGraw-Hill Publication)",
    "Chair of Session, ICISP-2015, Nagpur (McGraw-Hill Publication)",
    "Reviewer, ICCUBEA 2015, Pune (IEEE Digital Explore)",
    'Best Paper Award, "Video Partitioning and Secured Keyframe Extraction", ICISP-2015, Nagpur',
];

const professionalMemberships: string[] = [
    "IEEE Professional Member — 80612094",
    "ISTE (Indian Society for Technical Education) — LM27925",
    "CSI (Computer Society of India) — LM 001 480-39",
];

const rolesAndResponsibilities: string[] = [
    "Technical Chair, International Conference on Pervasive Computing 2019",
    "Coordinator, Student Development Committee (2017, 2019)",
    "Coordinator, Monitoring and Coordination Committee (2018)",
    "Member, Internal Academic Monitoring Committee (2016–2019)",
    "Registered Reviewer, Elsevier Journal (2017 onwards)",
    "Member — advisory, technical & organizing committees; Reviewer for various international conferences (2015–2019)",
    "Senior Supervisor, SPPU Examination (2016, 2017, 2018)",
    "External Senior Supervisor, SPPU Examination (2017)",
    "Chairman, Multimedia Technologies (2015–2019)",
    "Chairman, Business Intelligence and Analytics (2017–2019)",
    "Chairman, Software Laboratory-1 (2017, 2018)",
    "Adjunct Professor, CSE, MGMCOE Nanded (2017–19)",
    "Coordinator, Social Visit (2016–2019)",
    "Member, Anti-Ragging Committee (2016-17)",
    "Member, Women Harassment Cell (2016)",
    "Subject Chairman, Question Paper Audit Committee (2013–2019)",
    "Core Committee Member, NBA Preparation Work — UG & PG (2007)",
    "Member, NAAC Committee (2016-17)",
    "Coordinator, Student Feedback (2015, 2018)",
    "PG Coordinator / Co-coordinator, M.Tech. CSE (2007), ME IT (2010, 2014, 2016)",
    "Member, Research Progress Committee, M.Tech. CSE (2008, 2015)",
    "PG Admission & Interview Committee, M.Tech. CSE (2006–2007)",
    "Member, Best Student Selection Committee (2015)",
    "Coordinator / Member, Dead Stock Verification Committee (2014–2018)",
    "Coordinator, Train the Trainer Workshops (2014–2018)",
    "Coordinator, Workshop on Project Design (2009–2019)",
    "Coordinator, Sinhgad Karandak (2017–2019)",
    "Coordinator, Techtonic (2017–2019)",
    "Result Processing Committee (2010–2013)",
    "AICTE R&D Funding Proposal Committee (2017, 2019)",
    "Member, Examination Committee (2012)",
    "Member, Procurement Committee (2007–2011)",
    "Member, Exam Flying Squad (2009, 2011)",
    "Member, Physical Stock Verification (2006–2009)",
    "Member, CEP Committee (2006–2009)",
    "Member, Board of Studies, CSE (2005–2006)",
    "Member, R&D Committee (2007–2009)",
    "In-charge, UG Projects (2007, 2008, 2009)",
    "Member, Student Feedback (2007-08)",
    "Member, UG Admission Committee, ARC (2007, 2008)",
];

const textListSections: TextListSection[] = [
    {
        id: "university-services",
        title: "University Services",
        eyebrow: "Institutional Service",
        items: universityServices,
    },
    {
        id: "technical-skills",
        title: "Technical Skills",
        eyebrow: "Toolkit",
        items: technicalSkills,
    },
    {
        id: "fdp-organized",
        title: "FDP / Seminars / Workshops Organized",
        eyebrow: "Organized",
        items: fdpOrganized,
    },
    {
        id: "expert-lectures",
        title: "Invited Expert Lectures",
        eyebrow: "Invited Talks",
        items: expertLectures,
    },
    {
        id: "fdp-attended",
        title: "FDP / SDP / STTP Attended",
        eyebrow: "Continuing Education",
        items: fdpAttended,
        intro: "TEQIP / AICTE / ISTE sponsored programs — 60+ attended; selected highlights below.",
    },
    {
        id: "area-of-interest",
        title: "Area of Interest",
        eyebrow: "Focus Areas",
        items: areasOfInterest,
    },
    {
        id: "achievements",
        title: "Achievements",
        eyebrow: "Recognition",
        items: achievements,
    },
    {
        id: "research-grants",
        title: "Research Grants",
        eyebrow: "Funded Research",
        items: researchGrants,
    },
    {
        id: "research-participation",
        title: "Research Participation",
        eyebrow: "Editorial & Review Service",
        items: researchParticipation,
    },
    {
        id: "professional-membership",
        title: "Professional Membership",
        eyebrow: "Affiliations",
        items: professionalMemberships,
    },
    {
        id: "roles",
        title: "Roles & Responsibilities",
        eyebrow: "Institutional Roles",
        items: rolesAndResponsibilities,
    },
];

/* ============================================================================
   PRESENTATION LAYER
============================================================================ */

const publicationTypeOrder: PublicationType[] = ["Journal", "Conference", "Patent"];

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }): JSX.Element {
    return (
        <div className="section-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h2 className="section-title">{title}</h2>
        </div>
    );
}

export default function App(): JSX.Element {
    const [activeSection, setActiveSection] = useState<string>("home");
    const [menuOpen, setMenuOpen] = useState<boolean>(false);
    const [publicationFilter, setPublicationFilter] = useState<PublicationType | "All">("All");
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

    const filteredPublications = useMemo(() => {
        const list =
            publicationFilter === "All"
                ? publications
                : publications.filter((pub) => pub.type === publicationFilter);
        return [...list].sort((a, b) => Number(b.year) - Number(a.year));
    }, [publicationFilter]);

    const publicationCounts = useMemo(() => {
        const counts: Record<string, number> = { All: publications.length };
        publicationTypeOrder.forEach((type) => {
            counts[type] = publications.filter((pub) => pub.type === type).length;
        });
        return counts;
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id);
                    }
                });
            },
            { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
        );

        navItems.forEach((item) => {
            const el = sectionRefs.current[item.id];
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, []);

    const registerSectionRef = (id: string) => (el: HTMLElement | null) => {
        sectionRefs.current[id] = el;
    };

    const handleNavClick = (id: string) => {
        const el = sectionRefs.current[id];
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        setMenuOpen(false);
    };

    return (
        <>
            <style jsx>{`
        /* ============================================================================
           RESET & BASE
           ============================================================================ */
        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #fafafa;
          color: #111111;
          line-height: 1.6;
          -webkit-font-smoothing: antialiased;
        }

        .app-shell {
          display: flex;
          min-height: 100vh;
        }

        /* ============================================================================
           SIDEBAR
           ============================================================================ */
        .sidebar {
          position: fixed;
          top: 0;
          left: 0;
          z-index: 40;
          width: 280px;
          height: 100vh;
          background: #ffffff;
          border-right: 1px solid #eaeaea;
          padding: 32px 24px;
          overflow-y: auto;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .sidebar--open {
          transform: translateX(0);
        }

        @media (max-width: 768px) {
          .sidebar {
            transform: translateX(-100%);
          }
          .sidebar--open {
            transform: translateX(0);
          }
        }

        .sidebar-profile {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-bottom: 24px;
          border-bottom: 1px solid #eaeaea;
        }

        .sidebar-photo {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
          margin-bottom: 16px;
          flex-shrink: 0;
        }

        .sidebar-name {
          font-size: 18px;
          font-weight: 700;
          text-align: center;
          letter-spacing: -0.01em;
          color: #111111;
        }

        .sidebar-title {
          font-size: 14px;
          color: #666666;
          text-align: center;
          margin-top: 4px;
        }

        .sidebar-institution {
          font-size: 12px;
          color: #888888;
          text-align: center;
          margin-top: 2px;
        }

        .sidebar-socials {
          display: flex;
          gap: 8px;
          margin-top: 16px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .social-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid #eaeaea;
          color: #666666;
          transition: all 0.2s ease;
          text-decoration: none;
          font-size: 16px;
        }

        .social-icon:hover {
          transform: scale(1.05);
          border-color: var(--brand-color, #111111);
          color: var(--brand-color, #111111);
        }

        .cv-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 16px;
          padding: 8px 16px;
          border-radius: 6px;
          background: #111111;
          color: #ffffff;
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s ease;
          border: none;
          cursor: pointer;
        }

        .cv-button:hover {
          background: #333333;
          transform: translateY(-1px);
        }

        .sidebar-nav {
          margin-top: 24px;
        }

        .sidebar-nav ul {
          list-style: none;
        }

        .sidebar-nav li {
          margin-bottom: 2px;
        }

        .nav-link {
          display: block;
          width: 100%;
          padding: 6px 12px;
          border: none;
          background: transparent;
          color: #666666;
          font-size: 13px;
          text-align: left;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
          font-weight: 400;
          font-family: inherit;
        }

        .nav-link:hover {
          background: #f5f5f5;
          color: #111111;
        }

        .nav-link--active {
          background: #111111;
          color: #ffffff;
          font-weight: 500;
        }

        .nav-link--active:hover {
          background: #111111;
          color: #ffffff;
        }

        /* ============================================================================
           MOBILE NAV TOGGLE
           ============================================================================ */
        .mobile-nav-toggle {
          position: fixed;
          top: 16px;
          left: 16px;
          z-index: 50;
          display: none;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 8px;
          border: 1px solid #eaeaea;
          background: #ffffff;
          color: #111111;
          cursor: pointer;
          font-size: 18px;
          transition: all 0.2s ease;
        }

        .mobile-nav-toggle:hover {
          background: #f5f5f5;
        }

        @media (max-width: 768px) {
          .mobile-nav-toggle {
            display: flex;
          }
        }

        .sidebar-scrim {
          position: fixed;
          inset: 0;
          z-index: 30;
          background: rgba(0, 0, 0, 0.3);
          display: none;
        }

        @media (max-width: 768px) {
          .sidebar-scrim {
            display: block;
          }
        }

        /* ============================================================================
           MAIN CONTENT
           ============================================================================ */
        .content {
          flex: 1;
          margin-left: 280px;
          padding: 48px 64px;
          max-width: 1000px;
        }

        @media (max-width: 768px) {
          .content {
            margin-left: 0;
            padding: 80px 24px 48px;
          }
        }

        /* ============================================================================
           TYPOGRAPHY & SECTION ELEMENTS
           ============================================================================ */
        .section-heading {
          margin-bottom: 24px;
        }

        .eyebrow {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #888888;
          margin-bottom: 4px;
        }

        .section-title {
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #111111;
        }

        .section {
          scroll-margin-top: 16px;
          margin-bottom: 56px;
        }

        .section:last-of-type {
          margin-bottom: 0;
        }

        .section-intro {
          font-size: 14px;
          color: #666666;
          margin-bottom: 16px;
          line-height: 1.7;
        }

        .subheading {
          font-size: 14px;
          font-weight: 600;
          color: #111111;
          margin-bottom: 8px;
        }

        /* ============================================================================
           HERO SECTION
           ============================================================================ */
        .hero-section {
          margin-bottom: 56px;
        }

        .hero-name {
          font-size: 32px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #111111;
          margin: 0 0 4px 0;
        }

        .hero-qualification {
          font-size: 16px;
          color: #666666;
          margin-bottom: 12px;
        }

        .hero-summary {
          font-size: 15px;
          line-height: 1.7;
          color: #444444;
          max-width: 680px;
        }

        .hero-emails {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 8px;
        }

        .hero-email {
          font-size: 14px;
          color: #111111;
          text-decoration: none;
          border-bottom: 1px solid transparent;
          transition: border-color 0.2s ease;
        }

        .hero-email:hover {
          border-bottom-color: #111111;
        }

        /* ============================================================================
           STATS
           ============================================================================ */
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 12px;
          margin-top: 24px;
          max-width: 680px;
        }

        .stat-card {
          background: #ffffff;
          border: 1px solid #eaeaea;
          border-radius: 8px;
          padding: 16px;
          text-align: center;
        }

        .stat-value {
          display: block;
          font-size: 22px;
          font-weight: 700;
          color: #111111;
          letter-spacing: -0.01em;
        }

        .stat-label {
          font-size: 11px;
          color: #888888;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        /* ============================================================================
           CARDS
           ============================================================================ */
        .card-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        @media (min-width: 640px) {
          .card-list {
            grid-template-columns: 1fr 1fr;
          }
        }

        .card {
          background: #ffffff;
          border: 1px solid #eaeaea;
          border-radius: 8px;
          padding: 20px;
          transition: all 0.2s ease;
        }

        .card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
          transform: translateY(-2px);
        }

        .card-title {
          font-size: 15px;
          font-weight: 600;
          color: #111111;
          margin-bottom: 4px;
          line-height: 1.4;
        }

        .card-body {
          font-size: 14px;
          color: #666666;
          line-height: 1.6;
          margin: 4px 0;
        }

        .card-body--small {
          font-size: 13px;
        }

        .card-meta {
          font-size: 13px;
          color: #888888;
        }

        .card-meta--strong {
          color: #111111;
          font-weight: 500;
        }

        .card-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          gap: 8px;
        }

        .card-footer-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #f0f0f0;
          gap: 8px;
        }

        .card-year-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 40px;
          height: 40px;
          padding: 0 8px;
          border-radius: 50%;
          background: #f5f5f5;
          font-size: 13px;
          font-weight: 600;
          color: #111111;
          flex-shrink: 0;
        }

        .card-year-badge--gold {
          background: #fef9e7;
          color: #b7950b;
        }

        .education-card {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }

        .award-card {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }

        /* ============================================================================
           TIMELINE
           ============================================================================ */
        .timeline {
          position: relative;
          padding-left: 28px;
          list-style: none;
        }

        .timeline::before {
          content: "";
          position: absolute;
          left: 6px;
          top: 4px;
          bottom: 4px;
          width: 1px;
          background: #eaeaea;
        }

        .timeline-item {
          position: relative;
          margin-bottom: 24px;
        }

        .timeline-item:last-child {
          margin-bottom: 0;
        }

        .timeline-dot {
          position: absolute;
          left: -24px;
          top: 6px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 2px solid #111111;
          background: #fafafa;
        }

        .timeline-period {
          font-size: 13px;
          color: #888888;
          font-weight: 500;
        }

        .timeline-role {
          font-size: 15px;
          font-weight: 600;
          color: #111111;
          margin: 2px 0;
        }

        .timeline-org {
          font-size: 14px;
          color: #666666;
          margin: 0;
        }

        /* ============================================================================
           CHIPS & BADGES
           ============================================================================ */
        .chip {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          border: 1px solid transparent;
        }

        .chip--muted {
          background: #f5f5f5;
          color: #888888;
          border-color: #eaeaea;
        }

        .chip--outline {
          background: transparent;
          color: #666666;
          border-color: #eaeaea;
        }

        .chip--outline:hover {
          background: #f5f5f5;
        }

        .chip--status-ongoing {
          background: #fef9e7;
          color: #b7950b;
          border-color: #f9e79f;
        }

        .chip--status-completed {
          background: #eafaf1;
          color: #1a7a5a;
          border-color: #a9dfbf;
        }

        .chip--status-submitted {
          background: #ebf5fb;
          color: #1a5276;
          border-color: #aed6f1;
        }

        .badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .badge--journal {
          background: #ebf5fb;
          color: #1a5276;
        }

        .badge--conference {
          background: #f4ecf7;
          color: #6c3483;
        }

        .badge--patent {
          background: #eafaf1;
          color: #1a7a5a;
        }

        .chip-cloud {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        /* ============================================================================
           PUBLICATIONS
           ============================================================================ */
        .publication-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .publication-card .card-title {
          font-weight: 500;
          font-size: 14px;
        }

        .card-doi {
          font-size: 12px;
          color: #888888;
          margin-top: 4px;
          font-family: "SF Mono", Monaco, monospace;
        }

        /* ============================================================================
           FILTERS
           ============================================================================ */
        .filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 16px;
        }

        .filter-chip {
          padding: 4px 14px;
          border-radius: 16px;
          border: 1px solid #eaeaea;
          background: transparent;
          font-size: 12px;
          font-weight: 500;
          color: #666666;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .filter-chip:hover {
          background: #f5f5f5;
          border-color: #cccccc;
        }

        .filter-chip--active {
          background: #111111;
          color: #ffffff;
          border-color: #111111;
        }

        .filter-chip--active:hover {
          background: #333333;
        }

        .filter-count {
          font-size: 10px;
          opacity: 0.6;
          font-weight: 400;
        }

        .filter-chip--active .filter-count {
          opacity: 0.8;
        }

        /* ============================================================================
           LISTS
           ============================================================================ */
        .bullet-list {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .bullet-list li {
          padding-left: 20px;
          position: relative;
          font-size: 14px;
          color: #444444;
          line-height: 1.6;
        }

        .bullet-list li::before {
          content: "—";
          position: absolute;
          left: 0;
          color: #cccccc;
        }

        .two-column {
          display: grid;
          gap: 32px;
        }

        @media (min-width: 640px) {
          .two-column {
            grid-template-columns: 1fr 1fr;
          }
        }

        /* ============================================================================
           FOOTER
           ============================================================================ */
        .footer {
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid #eaeaea;
          text-align: center;
          font-size: 13px;
          color: #888888;
        }

        /* ============================================================================
           ANIMATIONS
           ============================================================================ */
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .section {
          animation: fadeUp 0.6s ease both;
        }

        .card {
          transition: all 0.2s ease;
        }

        /* ============================================================================
           SCROLLBAR
           ============================================================================ */
        .sidebar::-webkit-scrollbar {
          width: 4px;
        }

        .sidebar::-webkit-scrollbar-track {
          background: transparent;
        }

        .sidebar::-webkit-scrollbar-thumb {
          background: #d0d0d0;
          border-radius: 2px;
        }

        .sidebar::-webkit-scrollbar-thumb:hover {
          background: #b0b0b0;
        }
      `}</style>

            <div className="app-shell">
                {/* Mobile Navigation Toggle */}
                <button
                    type="button"
                    className="mobile-nav-toggle"
                    aria-label={menuOpen ? "Close navigation" : "Open navigation"}
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    {menuOpen ? <FaTimes /> : <FaBars />}
                </button>

                {/* Sidebar */}
                <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`}>
                    <div className="sidebar-profile">
                        <div className="sidebar-photo" role="img" aria-label={profile.name} />
                        <h1 className="sidebar-name">{profile.name}</h1>
                        <p className="sidebar-title">{profile.title}</p>
                        <p className="sidebar-institution">{profile.institution}</p>

                        <div className="sidebar-socials" aria-label="Social and professional profiles">
                            {socialLinks.map((link) => (
                                <a
                                    key={link.id}
                                    href={link.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="social-icon"
                                    aria-label={link.label}
                                    style={{ ["--brand-color" as string]: link.brandColor }}
                                >
                                    {link.icon}
                                </a>
                            ))}
                        </div>

                        <a className="cv-button" href={profile.bioFile} download>
                            <FaFileDownload aria-hidden="true" />
                            <span>Download Biography</span>
                        </a>
                    </div>

                    <nav className="sidebar-nav" aria-label="Section navigation">
                        <ul>
                            {navItems.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        className={activeSection === item.id ? "nav-link nav-link--active" : "nav-link"}
                                        onClick={() => handleNavClick(item.id)}
                                    >
                                        {item.shortLabel ?? item.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </aside>

                {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

                {/* Main Content */}
                <main className="content">
                    {/* Hero Section */}
                    <section id="home" ref={registerSectionRef("home")} className="section hero-section">
                        <p className="eyebrow">Overview</p>
                        <h2 className="hero-name">{profile.formalName}</h2>
                        <p className="hero-qualification">{profile.qualification}</p>
                        <p className="hero-summary">{profile.summary}</p>

                        <div className="hero-emails">
                            {profile.emails.map((email) => (
                                <a key={email} href={`mailto:${email}`} className="hero-email">
                                    {email}
                                </a>
                            ))}
                        </div>

                        <div className="stat-grid">
                            {stats.map((stat) => (
                                <div key={stat.id} className="stat-card">
                                    <span className="stat-value">{stat.value}</span>
                                    <span className="stat-label">{stat.label}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Education */}
                    <SectionHeading eyebrow="Academic Qualification" title="Education" />
                    <section id="education" ref={registerSectionRef("education")} className="section">
                        <div className="card-list">
                            {education.map((item) => (
                                <article key={item.id} className="card education-card">
                                    <div className="card-year-badge">{item.year}</div>
                                    <div>
                                        <h3 className="card-title">{item.degree}</h3>
                                        <p className="card-body">{item.institution}</p>
                                        <p className="card-meta">{item.detail}</p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>

                    {/* Experience */}
                    <SectionHeading eyebrow="Academic Experience" title="Experience" />
                    <section id="experience" ref={registerSectionRef("experience")} className="section">
                        <ol className="timeline">
                            {experience.map((item) => (
                                <li key={item.id} className="timeline-item">
                                    <span className="timeline-dot" aria-hidden="true" />
                                    <div className="timeline-content">
                                        <span className="timeline-period">{item.period}</span>
                                        <h3 className="timeline-role">{item.role}</h3>
                                        <p className="timeline-org">{item.organization}</p>
                                        {item.basis && <span className="chip chip--muted">{item.basis}</span>}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </section>

                    {/* Research Projects */}
                    <SectionHeading eyebrow="Funded Research" title="Research Projects" />
                    <section id="research-projects" ref={registerSectionRef("research-projects")} className="section">
                        <div className="card-list">
                            {researchProjects.map((project) => (
                                <article key={project.id} className="card">
                                    <div className="card-header-row">
                                        <span className={`chip chip--status-${project.status.toLowerCase()}`}>{project.status}</span>
                                        <span className="card-meta">{project.period}</span>
                                    </div>
                                    <h3 className="card-title">{project.title}</h3>
                                    <p className="card-body">{project.description}</p>
                                    <div className="card-footer-row">
                                        <span className="card-meta">{project.funder}</span>
                                        <span className="card-meta card-meta--strong">{project.amount}</span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>

                    {/* Publications */}
                    <SectionHeading eyebrow="Research Output" title="Publications" />
                    <section id="publications" ref={registerSectionRef("publications")} className="section">
                        <div className="filter-row" role="tablist" aria-label="Filter publications by type">
                            {(["All", ...publicationTypeOrder] as const).map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    role="tab"
                                    aria-selected={publicationFilter === type}
                                    className={publicationFilter === type ? "filter-chip filter-chip--active" : "filter-chip"}
                                    onClick={() => setPublicationFilter(type)}
                                >
                                    {type}
                                    <span className="filter-count">{publicationCounts[type]}</span>
                                </button>
                            ))}
                        </div>

                        <div className="publication-list">
                            {filteredPublications.map((pub) => (
                                <article key={pub.id} className="card publication-card">
                                    <a href={pub.doi ? ('https://doi.org/' + pub.doi) : undefined} target="_blank" rel="noopener noreferrer">
                                        <div className="card-header-row">
                                            <span className={`badge badge--${pub.type.toLowerCase()}`}>{pub.type}</span>
                                            <span className="card-meta">{pub.year}</span>
                                        </div>
                                        <h3 className="card-title">{pub.title}</h3>
                                        <p className="card-meta">{pub.authors}</p>
                                        <p className="card-body card-body--small">{pub.venue}</p>
                                        {pub.doi && <p className="card-doi">DOI: {pub.doi}</p>}
                                    </a></article>
                            ))}
                        </div>
                    </section>

                    {/* Awards */}
                    <SectionHeading eyebrow="Recognition" title="Awards" />
                    <section id="awards" ref={registerSectionRef("awards")} className="section">
                        <div className="card-list">
                            {awards.map((award) => (
                                <article key={award.id} className="card award-card">
                                    <div className="card-year-badge card-year-badge--gold">{award.year}</div>
                                    <div>
                                        <h3 className="card-title">{award.title}</h3>
                                        <p className="card-meta">{award.organization}</p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>

                    {/* PG/UG Guidance */}
                    <SectionHeading eyebrow="Mentorship" title="PG / UG Guidance" />
                    <section id="pg-ug-guidance" ref={registerSectionRef("pg-ug-guidance")} className="section">
                        <p className="section-intro">
                            SPPU-recognized Ph.D. guide since 2021, currently guiding 6 scholars. Research projects supervised
                            for 30+ postgraduate and 60+ undergraduate students, including:
                        </p>
                        <ul className="bullet-list">
                            {pgUgProjects.map((proj) => (
                                <li key={proj}>{proj}</li>
                            ))}
                        </ul>
                    </section>

                    {/* PC Member */}
                    <SectionHeading eyebrow="Editorial & Review Service" title="PC Member / Editor / Reviewer" />
                    <section id="pc-member" ref={registerSectionRef("pc-member")} className="section">
                        <ul className="bullet-list">
                            {pcMemberRoles.map((role) => (
                                <li key={role}>{role}</li>
                            ))}
                        </ul>
                    </section>

                    {/* Text List Sections */}
                    {textListSections.map((sec) => (
                        <React.Fragment key={sec.id}>
                            <SectionHeading eyebrow={sec.eyebrow} title={sec.title} />
                            <section id={sec.id} ref={registerSectionRef(sec.id)} className="section">
                                {sec.intro && <p className="section-intro">{sec.intro}</p>}
                                {sec.id === "technical-skills" || sec.id === "area-of-interest" ? (
                                    <div className="chip-cloud">
                                        {sec.items.map((item) => (
                                            <span key={item} className="chip chip--outline">
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <ul className="bullet-list">
                                        {sec.items.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </React.Fragment>
                    ))}

                    {/* Courses Taught */}
                    <SectionHeading eyebrow="Teaching" title="Courses Taught" />
                    <section id="courses-taught" ref={registerSectionRef("courses-taught")} className="section">
                        <div className="two-column">
                            <div>
                                <h3 className="subheading">Undergraduate</h3>
                                <ul className="bullet-list">
                                    {coursesUG.map((course) => (
                                        <li key={course}>{course}</li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <h3 className="subheading">Postgraduate</h3>
                                <ul className="bullet-list">
                                    {coursesPG.map((course) => (
                                        <li key={course}>{course}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Patents */}
                    <SectionHeading eyebrow="Intellectual Property" title="Patents" />
                    <section id="patents" ref={registerSectionRef("patents")} className="section">
                        <div className="publication-list">
                            {patents.map((pat) => (
                                <article key={`patents-section-${pat.id}`} className="card publication-card">
                                    <div className="card-header-row">
                                        <span className="badge badge--patent">Patent</span>
                                        <span className="card-meta">{pat.year}</span>
                                    </div>
                                    <h3 className="card-title">{pat.title}</h3>
                                    <p className="card-meta">{pat.authors}</p>
                                    <p className="card-body card-body--small">{pat.venue}</p>
                                </article>
                            ))}
                        </div>
                    </section>

                    <footer className="footer">
                        <p>
                            {profile.name} · {profile.institution}
                        </p>
                    </footer>
                </main>
            </div>
        </>
    );
}