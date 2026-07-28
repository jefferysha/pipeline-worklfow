import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  FileCheck2,
  GitBranch,
  LayoutDashboard,
  LockKeyhole,
  PlugZap,
  ScanSearch,
  ShieldCheck,
  Terminal,
  Workflow,
} from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { useT } from '../i18n'
import {
  communityLinks,
  evidenceSteps,
  hostTiers,
  solutionModes,
  solutionModules,
  solutionPhases,
} from './solutionModel'

interface SectionHeadingProps {
  eyebrow: string
  title: string
  description: string
}

function SectionHeading({ eyebrow, title, description }: SectionHeadingProps): JSX.Element {
  return (
    <div className="mb-8 max-w-3xl">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-(--accent)">{eyebrow}</p>
      <h2 className="text-3xl font-bold tracking-[-0.03em] text-text mobile:text-2xl">{title}</h2>
      <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
    </div>
  )
}

const externalLinkClass =
  'inline-flex min-w-0 max-w-full items-center gap-2 rounded-md outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2'

export function SolutionView(): JSX.Element {
  const { t } = useT()

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1240px] space-y-20 overflow-hidden pb-16" data-testid="solution-view">
      <section className="grid min-w-0 max-w-full grid-cols-1 gap-10 rounded-3xl border border-border bg-card px-10 py-14 shadow-sm min-[940px]:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] mobile:px-5 mobile:py-9">
        <div className="min-w-0 w-full max-w-full">
          <Badge
            variant="outline"
            className="mb-5 w-auto max-w-full shrink whitespace-normal border-(--accent)/35 text-center leading-5 text-(--accent)"
          >
            {t('solution.eyebrow')}
          </Badge>
          <h1 className="max-w-3xl text-5xl font-bold leading-[1.08] tracking-[-0.045em] text-text mobile:text-3xl">
            {t('solution.hero_title')}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground mobile:text-base mobile:leading-7">
            {t('solution.hero_desc')}
          </p>
          <div className="mt-8 flex min-w-0 max-w-full flex-wrap gap-3">
            <Button asChild size="lg" className="min-w-0 max-w-full whitespace-normal bg-(--btn-hover) text-(--btn-fg) transition-colors motion-reduce:transition-none hover:bg-(--btn-hover)/90">
              <a
                href="https://github.com/jefferysha/tenon/blob/main/docs/usage/README.md"
                target="_blank"
                rel="noreferrer noopener"
              >
                {t('solution.cta_docs')}
                <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-w-0 max-w-full whitespace-normal transition-colors motion-reduce:transition-none">
              <a
                href="https://github.com/jefferysha/tenon"
                target="_blank"
                rel="noreferrer noopener"
              >
                {t('solution.cta_repo')}
              </a>
            </Button>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('solution.document_language_note')}
          </p>
        </div>
        <div className="min-w-0 w-full max-w-full self-end rounded-2xl border border-code-border bg-code-bg p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text">
            <Terminal className="size-4 text-(--accent)" aria-hidden="true" />
            {t('solution.setup_label')}
          </div>
          <pre className="max-w-full overflow-x-auto rounded-xl border border-code-border bg-bg px-4 py-4 text-sm text-text">
            <code>{t('solution.setup_cmd')}</code>
          </pre>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">{t('solution.hero_note')}</p>
        </div>
      </section>

      <section aria-label={t('solution.eyebrow')} className="grid min-w-0 grid-cols-1 gap-4 min-[800px]:grid-cols-3">
        {(['local', 'governed', 'portable'] as const).map((item, index) => {
          const Icon = index === 0 ? LockKeyhole : index === 1 ? FileCheck2 : PlugZap
          return (
            <div key={item} className="rounded-2xl border border-border bg-card p-6">
              <Icon className="mb-4 size-5 text-(--accent)" aria-hidden="true" />
              <p className="font-semibold text-text">{t(`solution.trust.${item}_title`)}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`solution.trust.${item}_desc`)}</p>
            </div>
          )
        })}
      </section>

      <section>
        <SectionHeading
          eyebrow={t('solution.sections.modes_eyebrow')}
          title={t('solution.sections.modes_title')}
          description={t('solution.sections.modes_desc')}
        />
        <div className="grid min-w-0 grid-cols-1 gap-4 min-[740px]:grid-cols-2 min-[1080px]:grid-cols-5" data-testid="solution-modes">
          {solutionModes.map((mode, index) => (
            <article
              key={mode}
              data-testid={`solution-mode-${mode}`}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <span className="text-xs font-bold tabular-nums text-(--accent)">0{index + 1}</span>
              <h3 className="mt-3 text-lg font-semibold text-text">{t(`solution.modes.${mode}.title`)}</h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-text">{t(`solution.modes.${mode}.shape`)}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`solution.modes.${mode}.desc`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow={t('solution.sections.workflow_eyebrow')}
          title={t('solution.sections.workflow_title')}
          description={t('solution.sections.workflow_desc')}
        />
        <div
          className="rounded-3xl border border-border bg-card p-7 mobile:p-5"
          data-testid="solution-workflow"
        >
          <ol className="grid gap-3 min-[620px]:grid-cols-4 min-[1050px]:grid-cols-7">
            {solutionPhases.map((phase, index) => (
              <li key={phase} className="relative rounded-xl border border-border bg-bg p-4">
                <span className="text-xs font-bold tabular-nums text-(--accent)">{index + 1}</span>
                <p className="mt-2 font-semibold text-text">{t(`solution.workflow.${phase}`)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-5 grid gap-3 min-[800px]:grid-cols-3">
            <div className="rounded-xl bg-fill px-4 py-3 text-sm font-medium text-text">
              <GitBranch className="mr-2 inline size-4 text-(--accent)" aria-hidden="true" />
              {t('solution.workflow.requirements_return')}
            </div>
            <div className="rounded-xl bg-fill px-4 py-3 text-sm font-medium text-text">
              <GitBranch className="mr-2 inline size-4 text-(--accent)" aria-hidden="true" />
              {t('solution.workflow.verify_return')}
            </div>
            <div className="rounded-xl bg-fill px-4 py-3 text-sm font-medium text-text">
              <ShieldCheck className="mr-2 inline size-4 text-(--accent)" aria-hidden="true" />
              {t('solution.workflow.review_note')}
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow={t('solution.sections.evidence_eyebrow')}
          title={t('solution.sections.evidence_title')}
          description={t('solution.sections.evidence_desc')}
        />
        <ol className="grid min-w-0 grid-cols-1 gap-4 desktop:grid-cols-5" data-testid="solution-evidence">
          {evidenceSteps.map((step, index) => (
            <li key={step} className="rounded-2xl border border-border bg-card p-5">
              <CheckCircle2 className="mb-4 size-5 text-(--accent)" aria-hidden="true" />
              <h3 className="font-semibold text-text">{t(`solution.evidence.${step}.title`)}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`solution.evidence.${step}.desc`)}</p>
              <span className="mt-4 block text-xs tabular-nums text-muted-foreground">0{index + 1}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionHeading
          eyebrow={t('solution.sections.modules_eyebrow')}
          title={t('solution.sections.modules_title')}
          description={t('solution.sections.modules_desc')}
        />
        <div className="grid min-w-0 grid-cols-1 gap-4 desktop:grid-cols-2 min-[1080px]:grid-cols-3" data-testid="solution-modules">
          {solutionModules.map((module, index) => {
            const icons = [Terminal, Workflow, LayoutDashboard, PlugZap, Bot, ScanSearch]
            const Icon = icons[index]
            return (
              <article key={module}>
                <Card className="h-full gap-4">
                  <CardHeader>
                    <Icon className="mb-2 size-5 text-(--accent)" aria-hidden="true" />
                    <h3 className="text-lg font-semibold text-text">{t(`solution.modules.${module}.title`)}</h3>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-muted-foreground">{t(`solution.modules.${module}.desc`)}</p>
                  </CardContent>
                </Card>
              </article>
            )
          })}
        </div>
      </section>

      <section data-testid="solution-install">
        <SectionHeading
          eyebrow={t('solution.sections.install_eyebrow')}
          title={t('solution.sections.install_title')}
          description={t('solution.sections.install_desc')}
        />
        <div className="grid min-w-0 grid-cols-1 gap-5 min-[900px]:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-border bg-card p-7 mobile:p-5">
            <p className="text-sm font-semibold text-(--accent)">{t('solution.install.requirement')}</p>
            <div className="mt-6 space-y-5">
              <div>
                <h3 className="mb-2 font-semibold text-text">{t('solution.install.codex_title')}</h3>
                <pre className="overflow-x-auto rounded-xl border border-code-border bg-code-bg p-4 text-sm text-text"><code>tenon setup --codex</code></pre>
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-text">{t('solution.install.claude_title')}</h3>
                <pre className="overflow-x-auto rounded-xl border border-code-border bg-code-bg p-4 text-sm text-text"><code>tenon setup --claude</code></pre>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">{t('solution.install.endpoint')}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('solution.install.trust')}</p>
          </div>
          <div className="space-y-3">
            {hostTiers.map((tier) => (
              <div
                key={tier}
                data-testid={`solution-tier-${tier}`}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <h3 className="font-semibold text-text">{t(`solution.install.tier_${tier}_title`)}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-text">{t(`solution.install.tier_${tier}_hosts`)}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t(`solution.install.tier_${tier}_desc`)}</p>
              </div>
            ))}
          </div>
        </div>
        <div
          className="mt-5 rounded-2xl border border-dashed border-border bg-fill px-5 py-4 text-sm text-muted-foreground"
          data-testid="solution-optional"
        >
          {t('solution.install.optional')}
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow={t('solution.sections.safety_eyebrow')}
          title={t('solution.sections.safety_title')}
          description={t('solution.sections.safety_desc')}
        />
        <div className="grid min-w-0 grid-cols-1 gap-4 min-[800px]:grid-cols-3">
          {(['manual', 'scope', 'truth'] as const).map((item) => (
            <div key={item} className="rounded-2xl border border-border bg-card p-6">
              <ShieldCheck className="mb-4 size-5 text-(--accent)" aria-hidden="true" />
              <h3 className="font-semibold text-text">{t(`solution.safety.${item}_title`)}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`solution.safety.${item}_desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow={t('solution.sections.community_eyebrow')}
          title={t('solution.sections.community_title')}
          description={t('solution.sections.community_desc')}
        />
        <div className="grid min-w-0 grid-cols-1 gap-3 min-[620px]:grid-cols-2 min-[960px]:grid-cols-3" data-testid="solution-community">
          {communityLinks.map((link) => (
            <a
              key={link.id}
              className={`${externalLinkClass} justify-between border border-border bg-card px-5 py-4 font-medium text-text hover:border-(--accent)/50 hover:text-(--accent)`}
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t(`solution.community.${link.id}`)}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
