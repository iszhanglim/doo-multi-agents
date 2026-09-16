import {
  DOOAssessment,
  ChildPortrait,
  BasePortrait,
  ProgressivePortrait,
  RadarData,
  GrowthPoint,
  ClassPortraitGroup,
} from '../core/types';
import { DOOModel } from '../doo/DOOModel';

export class PortraitEngine {
  createBasePortrait(childId: string, name: string, classId: string): ChildPortrait {
    return {
      childId,
      name,
      classId,
      basePortrait: {
        createdAt: new Date(),
        updatedAt: new Date(),
        assessments: [],
      },
      progressivePortraits: [],
      currentRadar: {
        diction: 0,
        organization: 0,
        opinion: 0,
      },
    };
  }

  updatePortrait(portrait: ChildPortrait, assessment: DOOAssessment): ChildPortrait {
    const updatedPortrait = { ...portrait };

    updatedPortrait.basePortrait = {
      ...updatedPortrait.basePortrait,
      assessments: [...updatedPortrait.basePortrait.assessments, assessment],
      updatedAt: new Date(),
    };

    updatedPortrait.currentRadar = this.calculateRadarData(assessment.dimensions);

    return updatedPortrait;
  }

  addProgressivePortrait(
    portrait: ChildPortrait,
    period: string,
    startDate: Date,
    endDate: Date,
    assessments: DOOAssessment[]
  ): ChildPortrait {
    const growthTrajectory = this.calculateGrowthTrajectory(assessments);

    const progressivePortrait: ProgressivePortrait = {
      period,
      startDate,
      endDate,
      assessments,
      growthTrajectory,
    };

    return {
      ...portrait,
      progressivePortraits: [...portrait.progressivePortraits, progressivePortrait],
    };
  }

  calculateRadarData(dimensions: DOOAssessment['dimensions']): RadarData {
    const averages = DOOModel.calculateDimensionAverage(dimensions);
    return {
      diction: averages.diction,
      organization: averages.organization,
      opinion: averages.opinion,
    };
  }

  calculateGrowthTrajectory(assessments: DOOAssessment[]): GrowthPoint[] {
    const sorted = [...assessments].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    return sorted.map(assessment => ({
      period: assessment.timestamp.toISOString().split('T')[0],
      assessmentId: assessment.id,
      dimensions: assessment.dimensions,
      overallLevel: assessment.overallLevel,
    }));
  }

  generateClassPortraitGroup(
    classId: string,
    className: string,
    portraits: ChildPortrait[]
  ): ClassPortraitGroup {
    const validPortraits = portraits.filter(p => p.classId === classId);

    const averageRadar = this.calculateClassAverageRadar(validPortraits);

    return {
      classId,
      className,
      children: validPortraits,
      averageRadar,
      generatedAt: new Date(),
    };
  }

  private calculateClassAverageRadar(portraits: ChildPortrait[]): RadarData {
    if (portraits.length === 0) {
      return { diction: 0, organization: 0, opinion: 0 };
    }

    const total = portraits.reduce(
      (sum, p) => ({
        diction: sum.diction + p.currentRadar.diction,
        organization: sum.organization + p.currentRadar.organization,
        opinion: sum.opinion + p.currentRadar.opinion,
      }),
      { diction: 0, organization: 0, opinion: 0 }
    );

    return {
      diction: Math.round((total.diction / portraits.length) * 100) / 100,
      organization: Math.round((total.organization / portraits.length) * 100) / 100,
      opinion: Math.round((total.opinion / portraits.length) * 100) / 100,
    };
  }

  comparePortraits(
    before: ChildPortrait,
    after: ChildPortrait
  ): {
    dictionChange: number;
    organizationChange: number;
    opinionChange: number;
    overallChange: number;
  } {
    return {
      dictionChange: Math.round((after.currentRadar.diction - before.currentRadar.diction) * 100) / 100,
      organizationChange:
        Math.round((after.currentRadar.organization - before.currentRadar.organization) * 100) / 100,
      opinionChange: Math.round((after.currentRadar.opinion - before.currentRadar.opinion) * 100) / 100,
      overallChange:
        Math.round(
          ((after.currentRadar.diction +
            after.currentRadar.organization +
            after.currentRadar.opinion -
            before.currentRadar.diction -
            before.currentRadar.organization -
            before.currentRadar.opinion) /
            3) *
            100
        ) / 100,
    };
  }

  generatePortraitSummary(portrait: ChildPortrait): string {
    const latestAssessment = portrait.basePortrait.assessments[portrait.basePortrait.assessments.length - 1];

    if (!latestAssessment) {
      return `${portrait.name}暂无评估数据。`;
    }

    const dims = latestAssessment.dimensions;
    const radar = portrait.currentRadar;

    const summary = [
      `【${portrait.name}的叙事能力画像】`,
      ``,
      `最新评估时间：${latestAssessment.timestamp.toLocaleString()}`,
      `整体水平：${latestAssessment.overallLevel}级`,
      ``,
      `三维度雷达图数据：`,
      `  词句维度：${radar.diction}`,
      `  组织维度：${radar.organization}`,
      `  观点维度：${radar.opinion}`,
      ``,
      `详细评估：`,
      `  词汇水平：${dims.diction.vocabulary}级`,
      `  句子结构：${dims.diction.sentenceStructure}级`,
      `  叙事结构：${dims.organization.narrativeStructure}级`,
      `  主题贴切：${dims.organization.themeRelevance}级`,
      `  事件扩展：${dims.organization.eventExpansion}级`,
      `  表现性：${dims.organization.expressiveness}级`,
      `  叙事观点：${dims.opinion.narrativeViewpoint}级`,
      ``,
      `评估次数：${portrait.basePortrait.assessments.length}次`,
    ];

    if (latestAssessment.suggestions.length > 0) {
      summary.push(``, `发展建议：`, `  ${latestAssessment.suggestions[0]}`);
    }

    return summary.join('\n');
  }
}
