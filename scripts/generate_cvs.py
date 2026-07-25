#!/usr/bin/env python3
"""
Part 7 — Demo Data Generator
Generates 15 sample PDF CVs (5 per seeded job) for the HR Recruiting System defense demo.

Seeded jobs:
  1. Senior Python Developer      (python, django, fastapi, postgresql, docker, rest api, git | 3yr)
  2. React Frontend Engineer      (react, typescript, javascript, tailwind, git, rest api | 2yr)
  3. DevOps / Cloud Engineer      (aws, docker, kubernetes, terraform, ci/cd, linux, ansible | 4yr)

CV distribution per job:
  - 3 strong matches  (score expected ≥ 75%)
  - 1 borderline      (score expected 60–74%)
  - 1 clear reject    (score expected < 50%)

Usage:
  pip install reportlab
  python generate_cvs.py
  → writes 15 PDFs into ./sample_cvs/
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle
)

OUTPUT_DIR = "sample_cvs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Style helpers ────────────────────────────────────────────────────────────

def build_styles():
    base = getSampleStyleSheet()
    return {
        "name": ParagraphStyle("name", fontSize=18, fontName="Helvetica-Bold",
                               textColor=colors.HexColor("#1e40af"), spaceAfter=2),
        "contact": ParagraphStyle("contact", fontSize=9, textColor=colors.HexColor("#6b7280"),
                                  spaceAfter=8),
        "section": ParagraphStyle("section", fontSize=11, fontName="Helvetica-Bold",
                                  textColor=colors.HexColor("#1e40af"), spaceBefore=10, spaceAfter=4),
        "body": ParagraphStyle("body", fontSize=9.5, leading=14, spaceAfter=3),
        "bullet": ParagraphStyle("bullet", fontSize=9.5, leading=14, leftIndent=12,
                                 bulletIndent=0, spaceAfter=2),
        "skills_block": ParagraphStyle("skills_block", fontSize=9.5, leading=15,
                                       textColor=colors.HexColor("#374151")),
    }


def divider():
    return HRFlowable(width="100%", thickness=0.5,
                      color=colors.HexColor("#e5e7eb"), spaceAfter=6, spaceBefore=2)


def section_header(title, styles):
    return Paragraph(title.upper(), styles["section"])


def skill_pill_line(skills: list, styles) -> Paragraph:
    pills = "   ".join(f"<b>{s}</b>" for s in skills)
    return Paragraph(pills, styles["skills_block"])


def generate_cv(filename: str, data: dict):
    path = os.path.join(OUTPUT_DIR, filename)
    doc = SimpleDocTemplate(
        path, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=1.8*cm, bottomMargin=1.8*cm
    )
    styles = build_styles()
    story = []

    story.append(Paragraph(data["name"], styles["name"]))
    contact_line = f"{data['email']}  |  {data['phone']}  |  {data['location']}"
    if data.get("linkedin"):
        contact_line += f"  |  {data['linkedin']}"
    story.append(Paragraph(contact_line, styles["contact"]))
    story.append(divider())

    story.append(section_header("Professional Summary", styles))
    story.append(Paragraph(data["summary"], styles["body"]))
    story.append(divider())

    story.append(section_header("Technical Skills", styles))
    story.append(skill_pill_line(data["skills"], styles))
    story.append(divider())

    story.append(section_header("Work Experience", styles))
    for exp in data["experience"]:
        story.append(Paragraph(
            f"<b>{exp['title']}</b> — {exp['company']}   <font color='#6b7280'><i>{exp['period']}</i></font>",
            styles["body"]
        ))
        for b in exp["bullets"]:
            story.append(Paragraph(f"• {b}", styles["bullet"]))
        story.append(Spacer(1, 4))
    story.append(divider())

    story.append(section_header("Education", styles))
    for edu in data["education"]:
        story.append(Paragraph(
            f"<b>{edu['degree']}</b> — {edu['institution']} ({edu['year']})",
            styles["body"]
        ))

    if data.get("certifications"):
        story.append(divider())
        story.append(section_header("Certifications", styles))
        for cert in data["certifications"]:
            story.append(Paragraph(f"• {cert}", styles["bullet"]))

    doc.build(story)
    print(f"  [OK] {filename}")


# ═══════════════════════════════════════════════════════════════════════════════
# JOB 1 — Senior Python Developer
# ═══════════════════════════════════════════════════════════════════════════════

PYTHON_CVS = [
    dict(
        name="Arman Hossain", email="arman.hossain@email.com", phone="+880-1712-345678",
        location="Dhaka, Bangladesh", linkedin="linkedin.com/in/armanhossain",
        summary="Senior Python Developer with 5+ years of experience building scalable REST APIs and microservices using FastAPI and Django. Deep expertise in PostgreSQL, Docker containerisation, and Git-based workflows. Passionate about clean, tested code and CI/CD automation.",
        skills=["Python","Django","FastAPI","PostgreSQL","Docker","REST API","Git","Redis","Celery","Linux","pytest","SQLAlchemy"],
        experience=[
            dict(title="Senior Backend Developer", company="TechStar Ltd.", period="2020 – Present", bullets=[
                "Designed and maintained 12 production microservices in FastAPI serving 200k daily requests.",
                "Migrated legacy Django monolith to Docker-compose; reduced deployment time by 60%.",
                "Optimised PostgreSQL queries (indexes, EXPLAIN ANALYZE), cutting P95 latency by 40%.",
                "Implemented JWT auth and role-based access control across 3 internal platforms.",
            ]),
            dict(title="Python Developer", company="Softlify", period="2018 – 2020", bullets=[
                "Built Django REST Framework APIs consumed by 3 mobile clients.",
                "Managed Git branching strategy (GitFlow) across a 10-person team.",
            ]),
        ],
        education=[dict(degree="B.Sc. in Computer Science & Engineering", institution="BUET", year="2018")],
        certifications=["AWS Certified Developer – Associate", "Docker Certified Associate"],
    ),
    dict(
        name="Nusrat Jahan", email="nusrat.jahan@dev.io", phone="+880-1815-987654",
        location="Chittagong, Bangladesh", linkedin="linkedin.com/in/nusratjahan-dev",
        summary="Python engineer with 4 years specialising in FastAPI back-end services, PostgreSQL data modelling, and Docker-based deployments. Experienced in agile teams delivering high-traffic REST APIs.",
        skills=["Python","FastAPI","Django","PostgreSQL","Docker","REST API","Git","pandas","numpy","scikit-learn","Alembic"],
        experience=[
            dict(title="Backend Python Developer", company="DataBridge Solutions", period="2021 – Present", bullets=[
                "Developed FastAPI microservices handling 50k+ daily API calls with sub-50ms P99.",
                "Designed PostgreSQL schemas with proper normalisation and indexing strategies.",
                "Containerised all services with Docker; wrote docker-compose manifests for dev/prod.",
                "Integrated Stripe payment gateway via REST API, processing $2M+ monthly.",
            ]),
            dict(title="Junior Python Developer", company="iLogic BD", period="2019 – 2021", bullets=[
                "Built Django admin dashboards for internal HR and finance tooling.",
                "Wrote unit and integration tests using pytest, achieving 85% code coverage.",
            ]),
        ],
        education=[dict(degree="B.Sc. Computer Science", institution="CUET", year="2019")],
        certifications=["Google Associate Cloud Engineer"],
    ),
    dict(
        name="Tariqul Islam", email="tariq.islam93@gmail.com", phone="+880-1923-001122",
        location="Rajshahi, Bangladesh", linkedin=None,
        summary="Python developer with exactly 3 years of hands-on experience in Django and FastAPI. Strong PostgreSQL and Docker skills. Comfortable working in remote agile teams using Git for version control and code review workflows.",
        skills=["Python","Django","FastAPI","PostgreSQL","Docker","REST API","Git","Linux","Nginx","Gunicorn"],
        experience=[
            dict(title="Python Developer", company="CloudNine IT", period="2021 – Present", bullets=[
                "Delivered 4 client projects using Django + PostgreSQL from requirement to deployment.",
                "Wrote REST APIs with FastAPI consumed by React frontends.",
                "Dockerised applications and wrote multi-stage Dockerfiles to reduce image size by 35%.",
            ]),
            dict(title="Python Intern", company="StartupHive BD", period="2020 – 2021", bullets=[
                "Contributed to a Django-based SaaS product serving 5k users.",
            ]),
        ],
        education=[dict(degree="B.Sc. Software Engineering", institution="RUET", year="2020")],
    ),
    dict(
        name="Mahfuz Rahman", email="mahfuz.rahman@outlook.com", phone="+880-1612-556677",
        location="Sylhet, Bangladesh", linkedin=None,
        summary="Python and Django developer with 2 years of professional experience. Familiar with PostgreSQL and REST API design. Currently learning Docker and cloud deployment practices.",
        skills=["Python","Django","PostgreSQL","REST API","Git","HTML","CSS","JavaScript"],
        experience=[
            dict(title="Django Developer", company="WebCraft Agency", period="2022 – Present", bullets=[
                "Built 6 client websites using Django with PostgreSQL backends.",
                "Integrated third-party REST APIs (payment, SMS gateways).",
                "Used Git for source control and collaborated via GitHub pull requests.",
            ]),
        ],
        education=[dict(degree="B.Sc. Information Technology", institution="SUST", year="2022")],
    ),
    dict(
        name="Farida Begum", email="farida.design@gmail.com", phone="+880-1755-334455",
        location="Dhaka, Bangladesh", linkedin="linkedin.com/in/farida-ux",
        summary="Creative UI/UX Designer with 3 years of experience creating user-centred digital products. Expert in Figma, Adobe XD, and visual communication. Passionate about intuitive design and user research.",
        skills=["Figma","Adobe XD","Photoshop","Illustrator","HTML","CSS","Wireframing","Prototyping","User Research","Design Systems"],
        experience=[
            dict(title="UI/UX Designer", company="Creative Studio BD", period="2021 – Present", bullets=[
                "Designed 20+ mobile and web application interfaces for fintech and e-commerce clients.",
                "Conducted user interviews and usability testing sessions.",
                "Created and maintained a Figma-based design system used across 3 products.",
            ]),
        ],
        education=[dict(degree="B.F.A. Visual Communication Design", institution="University of Dhaka", year="2021")],
    ),
]

# ═══════════════════════════════════════════════════════════════════════════════
# JOB 2 — React Frontend Engineer
# ═══════════════════════════════════════════════════════════════════════════════

REACT_CVS = [
    dict(
        name="Sadia Islam", email="sadia.islam.fe@gmail.com", phone="+880-1812-667788",
        location="Dhaka, Bangladesh", linkedin="linkedin.com/in/sadiaislam-fe",
        summary="Frontend engineer with 4 years building production React applications using TypeScript, Tailwind CSS, and Next.js. Strong REST API integration skills and experience with modern state management (Redux Toolkit, Zustand). Passionate about performance, accessibility, and clean component design.",
        skills=["React","TypeScript","JavaScript","Tailwind CSS","Next.js","REST API","Git","Redux Toolkit","Vite","Jest","Figma"],
        experience=[
            dict(title="Senior React Developer", company="PixelForge Ltd.", period="2021 – Present", bullets=[
                "Led frontend development of a SaaS dashboard: React + TypeScript + Tailwind, 30k MAU.",
                "Reduced bundle size by 40% via code-splitting and lazy loading strategies.",
                "Integrated 8 REST APIs and wrote typed API client with Axios and React Query.",
                "Mentored 2 junior developers and conducted code reviews.",
            ]),
            dict(title="React Developer", company="DigitalArc", period="2019 – 2021", bullets=[
                "Converted static HTML/CSS sites to React component libraries.",
                "Implemented responsive layouts with Tailwind CSS mobile-first approach.",
            ]),
        ],
        education=[dict(degree="B.Sc. Computer Science", institution="NSU", year="2019")],
        certifications=["Meta React Developer Certificate"],
    ),
    dict(
        name="Rifat Hasan", email="rifat.hasan.dev@email.com", phone="+880-1911-223344",
        location="Dhaka, Bangladesh", linkedin="linkedin.com/in/rifathasan",
        summary="React and TypeScript developer with 3 years of experience delivering responsive SPAs and component libraries. Proficient in Tailwind CSS, Git workflows, and consuming RESTful APIs. Experience with test-driven development using Vitest and React Testing Library.",
        skills=["React","TypeScript","JavaScript","Tailwind CSS","Git","REST API","Vite","React Query","React Router","HTML5","CSS3"],
        experience=[
            dict(title="Frontend Developer", company="AppWave Technologies", period="2021 – Present", bullets=[
                "Built 5 client-facing React+TypeScript applications from scratch.",
                "Implemented design systems using Tailwind CSS, reducing styling time by 50%.",
                "Integrated REST APIs with proper loading/error states using React Query.",
                "Maintained Git branching strategy; reviewed 100+ pull requests.",
            ]),
            dict(title="Junior Frontend Dev", company="Freelance", period="2020 – 2021", bullets=[
                "Developed landing pages and admin dashboards for local SMEs.",
            ]),
        ],
        education=[dict(degree="B.Sc. Computer Science & Engineering", institution="IUT", year="2020")],
    ),
    dict(
        name="Lamiya Sultana", email="lamiya.sultana@reactdev.io", phone="+880-1700-998877",
        location="Khulna, Bangladesh", linkedin=None,
        summary="Frontend developer with 2 years of professional React and TypeScript experience. Built responsive UIs with Tailwind CSS and integrated REST APIs. Git-first workflow, collaborative team player, always learning.",
        skills=["React","TypeScript","JavaScript","Tailwind CSS","Git","REST API","HTML5","CSS3","Axios","npm"],
        experience=[
            dict(title="Frontend Developer", company="SoftEdge Solutions", period="2022 – Present", bullets=[
                "Developed React TypeScript UI for a logistics tracking platform.",
                "Implemented Tailwind-based responsive design across mobile and desktop breakpoints.",
                "Fetched and displayed REST API data with loading skeletons and error boundaries.",
            ]),
        ],
        education=[dict(degree="B.Sc. CSE", institution="Khulna University", year="2022")],
    ),
    dict(
        name="Emon Das", email="emon.das.web@gmail.com", phone="+880-1613-445566",
        location="Comilla, Bangladesh", linkedin=None,
        summary="Web developer with 1 year of experience using React and JavaScript. Self-taught, built several personal projects. Familiar with REST API integration and Git. Currently learning TypeScript and Tailwind.",
        skills=["React","JavaScript","HTML5","CSS3","Git","REST API","Bootstrap","jQuery","Node.js basics"],
        experience=[
            dict(title="Junior Web Developer", company="LocalTech BD", period="2023 – Present", bullets=[
                "Maintained and added features to a React-based e-commerce site.",
                "Consumed public REST APIs for weather and map features.",
            ]),
        ],
        education=[dict(degree="Diploma in Computer Technology", institution="Comilla Polytechnic", year="2022")],
    ),
    dict(
        name="Shahriar Kabir", email="shahriar.kabir.mech@gmail.com", phone="+880-1716-112233",
        location="Dhaka, Bangladesh", linkedin="linkedin.com/in/shahriarkabir-me",
        summary="Mechanical Engineer with 4 years of industry experience in product design, CAD modelling, and manufacturing process optimisation. Proficient in SolidWorks, AutoCAD, and ANSYS simulation tools.",
        skills=["SolidWorks","AutoCAD","ANSYS","MATLAB","MS Excel","Product Design","Thermodynamics","Manufacturing Processes"],
        experience=[
            dict(title="Mechanical Design Engineer", company="IndusTech Bangladesh", period="2020 – Present", bullets=[
                "Designed 15+ machine components using SolidWorks, reducing material waste by 20%.",
                "Performed FEA simulations in ANSYS to validate structural integrity.",
            ]),
        ],
        education=[dict(degree="B.Sc. Mechanical Engineering", institution="BUET", year="2020")],
    ),
]

# ═══════════════════════════════════════════════════════════════════════════════
# JOB 3 — DevOps / Cloud Engineer
# ═══════════════════════════════════════════════════════════════════════════════

DEVOPS_CVS = [
    dict(
        name="Rakibul Alam", email="rakib.devops@cloudeng.io", phone="+880-1818-778899",
        location="Dhaka, Bangladesh", linkedin="linkedin.com/in/rakibul-cloudops",
        summary="Senior DevOps / Cloud Engineer with 6 years of experience managing AWS infrastructure, Kubernetes clusters, and CI/CD pipelines. Expert in Terraform IaC, Ansible configuration management, and Linux systems administration. Track record of improving deployment frequency by 10x.",
        skills=["AWS","Docker","Kubernetes","Terraform","CI/CD","Linux","Ansible","Jenkins","GitHub Actions","Helm","Prometheus","Grafana"],
        experience=[
            dict(title="Senior Cloud Engineer", company="NexGen Cloud BD", period="2019 – Present", bullets=[
                "Managed production EKS clusters (50+ nodes) serving 1M+ daily requests on AWS.",
                "Wrote Terraform modules for VPC, RDS, EKS provisioning; reduced infra setup from 2 days to 30 min.",
                "Built GitLab CI/CD pipelines with automated testing, security scanning, and blue/green deployments.",
                "Configured Ansible playbooks for OS hardening across 200+ Linux servers.",
                "Implemented Prometheus + Grafana observability stack; MTTR reduced by 55%.",
            ]),
            dict(title="DevOps Engineer", company="TechRoots", period="2017 – 2019", bullets=[
                "Containerised 15 applications using Docker and Docker Compose.",
                "Managed on-prem Linux servers (Ubuntu, CentOS) and AWS EC2 instances.",
            ]),
        ],
        education=[dict(degree="B.Sc. Computer Science", institution="BUET", year="2017")],
        certifications=["AWS Solutions Architect – Professional","CKA (Certified Kubernetes Administrator)","HashiCorp Terraform Associate"],
    ),
    dict(
        name="Farhana Khanam", email="farhana.khanam.ops@gmail.com", phone="+880-1917-334455",
        location="Dhaka, Bangladesh", linkedin="linkedin.com/in/farhanakhanam-devops",
        summary="DevOps Engineer with 5 years building and operating cloud infrastructure on AWS. Proficient in Docker, Kubernetes, Terraform, and Ansible. Strong CI/CD pipeline experience using GitHub Actions and Jenkins. Linux sysadmin background ensures solid fundamentals.",
        skills=["AWS","Docker","Kubernetes","Terraform","CI/CD","Linux","Ansible","Python","Bash","GitHub Actions","Nginx","Redis"],
        experience=[
            dict(title="DevOps Engineer", company="FinTech Systems Ltd.", period="2020 – Present", bullets=[
                "Provisioned and maintained AWS infrastructure (EC2, RDS, ELB, S3, CloudFront) via Terraform.",
                "Deployed and managed 10 microservices on Kubernetes (EKS) with Helm charts.",
                "Automated deployments with GitHub Actions CI/CD; 0-downtime rolling releases.",
                "Wrote Ansible roles for software provisioning across dev, staging, and production.",
            ]),
            dict(title="Linux System Administrator", company="ServerPro BD", period="2018 – 2020", bullets=[
                "Administered 80 Ubuntu/CentOS servers; patching, monitoring, log management.",
                "Containerised legacy apps with Docker, reducing server count by 30%.",
            ]),
        ],
        education=[dict(degree="B.Sc. Computer Science & Engineering", institution="RUET", year="2018")],
        certifications=["AWS Solutions Architect – Associate","Certified Kubernetes Administrator"],
    ),
    dict(
        name="Mamunur Rashid", email="mamun.rashid.devops@email.com", phone="+880-1615-556677",
        location="Sylhet, Bangladesh", linkedin=None,
        summary="Cloud DevOps Engineer with 4 years of dedicated experience in AWS, Docker, Kubernetes, and Terraform. Skilled in building CI/CD pipelines and Linux server management. Ansible-certified and cloud-cost conscious.",
        skills=["AWS","Docker","Kubernetes","Terraform","CI/CD","Linux","Ansible","Jenkins","Bash","Git","EKS","S3"],
        experience=[
            dict(title="Cloud DevOps Engineer", company="AlphaOps BD", period="2020 – Present", bullets=[
                "Designed and deployed multi-region AWS architecture for high availability.",
                "Maintained Kubernetes clusters with HPA and resource quota policies.",
                "Wrote Terraform for all infrastructure; enforced IaC-only changes policy.",
                "Used Ansible to automate configuration of 60+ Linux VMs.",
                "Built Jenkins CI/CD pipeline: lint → unit test → Docker build → EKS deploy.",
            ]),
        ],
        education=[dict(degree="B.Sc. Computer Science", institution="SUST", year="2020")],
        certifications=["AWS DevOps Engineer – Professional"],
    ),
    dict(
        name="Raihan Uddin", email="raihan.uddin.it@gmail.com", phone="+880-1711-889900",
        location="Chittagong, Bangladesh", linkedin=None,
        summary="IT Engineer with 2 years of experience in Docker, Linux, and basic AWS. Set up CI/CD pipelines for small projects using GitHub Actions. Learning Kubernetes and Terraform to advance into cloud engineering.",
        skills=["Docker","Linux","AWS EC2","GitHub Actions","CI/CD","Git","Bash","Nginx","MySQL","Python basics"],
        experience=[
            dict(title="IT Engineer", company="StartupBD", period="2022 – Present", bullets=[
                "Managed Docker-compose deployments for 3 internal applications on AWS EC2.",
                "Set up GitHub Actions pipelines for automated testing and Docker image builds.",
                "Administered Ubuntu Linux servers: user management, cron jobs, log monitoring.",
            ]),
        ],
        education=[dict(degree="B.Sc. Information Technology", institution="CUET", year="2022")],
    ),
    dict(
        name="Sumaiya Akter", email="sumaiya.akter.hr@gmail.com", phone="+880-1813-223366",
        location="Dhaka, Bangladesh", linkedin="linkedin.com/in/sumaiya-hrmanager",
        summary="Experienced Human Resources Manager with 5 years in recruitment, employee relations, and talent development. Skilled in HRIS systems, labour law, performance management, and training & development programmes.",
        skills=["Recruitment","Employee Relations","Performance Management","HRIS","Labour Law","Training & Development","MS Office","Communication","Leadership","Teamwork"],
        experience=[
            dict(title="HR Manager", company="Garments Export Ltd.", period="2019 – Present", bullets=[
                "Managed end-to-end recruitment for 200+ positions annually.",
                "Designed and implemented a performance appraisal system for 1,500 employees.",
                "Ensured compliance with Bangladesh Labour Law across all HR processes.",
            ]),
        ],
        education=[dict(degree="MBA — Human Resource Management", institution="University of Dhaka", year="2019")],
    ),
]


def main():
    print(f"\n{'='*55}")
    print("  HR Recruiting System — Sample CV Generator")
    print(f"  Output directory: ./{OUTPUT_DIR}/")
    print(f"{'='*55}\n")

    print("[Job 1] Senior Python Developer")
    for i, cv_data in enumerate(PYTHON_CVS, 1):
        generate_cv(f"python_dev_cv_{i:02d}_{cv_data['name'].replace(' ', '_')}.pdf", cv_data)

    print("\n[Job 2] React Frontend Engineer")
    for i, cv_data in enumerate(REACT_CVS, 1):
        generate_cv(f"react_fe_cv_{i:02d}_{cv_data['name'].replace(' ', '_')}.pdf", cv_data)

    print("\n[Job 3] DevOps / Cloud Engineer")
    for i, cv_data in enumerate(DEVOPS_CVS, 1):
        generate_cv(f"devops_cv_{i:02d}_{cv_data['name'].replace(' ', '_')}.pdf", cv_data)

    print(f"\n{'='*55}")
    print(f"  Generated 15 CVs in ./{OUTPUT_DIR}/")
    print(f"{'='*55}")
    print("\nCV Breakdown:")
    print("  python_dev_cv_01 — Arman Hossain      STRONG MATCH  (5yr, all skills)")
    print("  python_dev_cv_02 — Nusrat Jahan        STRONG MATCH  (4yr, all skills)")
    print("  python_dev_cv_03 — Tariqul Islam       STRONG MATCH  (3yr, exact match)")
    print("  python_dev_cv_04 — Mahfuz Rahman       BORDERLINE    (2yr, missing docker/fastapi)")
    print("  python_dev_cv_05 — Farida Begum        CLEAR REJECT  (UX designer, no Python)")
    print("  react_fe_cv_01  — Sadia Islam          STRONG MATCH  (4yr, all skills)")
    print("  react_fe_cv_02  — Rifat Hasan          STRONG MATCH  (3yr, complete skills)")
    print("  react_fe_cv_03  — Lamiya Sultana       STRONG MATCH  (2yr, exact match)")
    print("  react_fe_cv_04  — Emon Das             BORDERLINE    (1yr, missing TS/Tailwind)")
    print("  react_fe_cv_05  — Shahriar Kabir       CLEAR REJECT  (Mechanical Engineer)")
    print("  devops_cv_01    — Rakibul Alam         STRONG MATCH  (6yr, all skills)")
    print("  devops_cv_02    — Farhana Khanam       STRONG MATCH  (5yr, all skills)")
    print("  devops_cv_03    — Mamunur Rashid       STRONG MATCH  (4yr, exact match)")
    print("  devops_cv_04    — Raihan Uddin         BORDERLINE    (2yr, missing ansible/terraform)")
    print("  devops_cv_05    — Sumaiya Akter        CLEAR REJECT  (HR Manager, zero tech skills)")
    print("\nNext steps:")
    print("  1. Copy sample_cvs/ to your demo machine")
    print("  2. Login to the HR system at http://localhost:3000")
    print("  3. Upload each CV via the 'Upload CV' tab")
    print("  4. Run 'Match All' against each seeded job")
    print("  5. Verify shortlisted/rejected split matches the legend above\n")


if __name__ == "__main__":
    main()
