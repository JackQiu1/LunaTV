/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';

import { SearchResult } from '@/lib/types';
import { useResponsiveGrid } from '@/hooks/useResponsiveGrid';
import VideoCard from '@/components/VideoCard';

const Grid = dynamic(
  () => import('react-window').then(mod => ({ default: mod.Grid })),
  { 
    ssr: false,
    loading: () => <div className="animate-pulse h-96 bg-gray-200 dark:bg-gray-800 rounded-lg" />
  }
);

interface VirtualSearchGridProps {
  // 搜索结果数据
  filteredResults: SearchResult[];
  filteredAggResults: [string, SearchResult[]][];
  
  // 视图模式
  viewMode: 'agg' | 'all';
  
  // 搜索相关
  searchQuery: string;
  isLoading: boolean;
  
  // VideoCard相关props
  groupStatsRef: React.MutableRefObject<Map<string, any>>;
  getGroupRef: (key: string) => React.RefObject<any>;
  computeGroupStats: (group: SearchResult[]) => any;
}

// 渐进式加载配置
const INITIAL_BATCH_SIZE = 12;
const LOAD_MORE_BATCH_SIZE = 8;
const LOAD_MORE_THRESHOLD = 5; // 距离底部还有5行时开始加载

export const VirtualSearchGrid: React.FC<VirtualSearchGridProps> = ({
  filteredResults,
  filteredAggResults,
  viewMode,
  searchQuery,
  isLoading,
  groupStatsRef,
  getGroupRef,
  computeGroupStats,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { columnCount, itemWidth, itemHeight, containerWidth } = useResponsiveGrid(containerRef);
  
  // 渐进式加载状态
  const [visibleItemCount, setVisibleItemCount] = useState(INITIAL_BATCH_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 使用 useMemo 缓存数据计算
  const { currentData, totalItemCount, displayItemCount, displayData, hasNextPage } = useMemo(() => {
    const data = viewMode === 'agg' ? filteredAggResults : filteredResults;
    const total = data.length;
    const itemCount = Math.min(visibleItemCount, total);
    const slicedData = data.slice(0, itemCount);
    const hasNext = itemCount < total;
    
    return {
      currentData: data,
      totalItemCount: total,
      displayItemCount: itemCount,
      displayData: slicedData,
      hasNextPage: hasNext
    };
  }, [viewMode, filteredAggResults, filteredResults, visibleItemCount]);

  // 重置可见项目数量（当搜索或过滤变化时）
  useEffect(() => {
    setVisibleItemCount(INITIAL_BATCH_SIZE);
    setIsLoadingMore(false);
  }, [currentData, viewMode]);

  // 强制重新计算容器尺寸的useEffect
  useEffect(() => {
    const checkContainer = () => {
      const element = containerRef.current;
    };
    
    checkContainer();
  }, [containerWidth]);

  // 加载更多项目
  const loadMoreItems = useCallback(() => {
    if (isLoadingMore || !hasNextPage) return;
    
    setIsLoadingMore(true);
    
    // 模拟异步加载
    setTimeout(() => {
      setVisibleItemCount(prev => Math.min(prev + LOAD_MORE_BATCH_SIZE, totalItemCount));
      setIsLoadingMore(false);
    }, 100);
  }, [isLoadingMore, hasNextPage, totalItemCount]);

  // 网格行数计算 - 使用 useMemo 缓存
  const rowCount = useMemo(() => {
    return Math.max(1, Math.ceil(displayItemCount / columnCount));
  }, [displayItemCount, columnCount]);

  // 渲染单个网格项 - react-window 2.0.0 新API格式
  const CellComponent = useCallback(({ 
    columnIndex, 
    rowIndex, 
    style,
    displayData: cellDisplayData,
    viewMode: cellViewMode,
    searchQuery: cellSearchQuery,
    columnCount: cellColumnCount,
    displayItemCount: cellDisplayItemCount,
    groupStatsRef: cellGroupStatsRef,
    getGroupRef: cellGetGroupRef,
    computeGroupStats: cellComputeGroupStats,
  }: any) => {
    const index = rowIndex * cellColumnCount + columnIndex;
    
    // 如果超出显示范围，返回空
    if (index >= cellDisplayItemCount) {
      return <div style={style} />;
    }

    const item = cellDisplayData[index];
    
    if (!item) {
      return <div style={style} />;
    }

    // 根据视图模式渲染不同内容
    if (cellViewMode === 'agg') {
      const [mapKey, group] = item as [string, SearchResult[]];
      const title = group[0]?.title || '';
      const poster = group[0]?.poster || '';
      const year = group[0]?.year || 'unknown';
      const { episodes, source_names, douban_id } = cellComputeGroupStats(group);
      const type = episodes === 1 ? 'movie' : 'tv';

      // 如果该聚合第一次出现，写入初始统计
      if (!cellGroupStatsRef.current.has(mapKey)) {
        cellGroupStatsRef.current.set(mapKey, { episodes, source_names, douban_id });
      }

      return (
        <div 
          style={{ 
            ...style, 
            padding: '8px',
            contain: 'layout style', // CSS containment 优化
            backfaceVisibility: 'hidden', // 减少重绘
          }}
        >
          <VideoCard
            ref={cellGetGroupRef(mapKey)}
            from='search'
            isAggregate={true}
            title={title}
            poster={poster}
            year={year}
            episodes={episodes}
            source_names={source_names}
            douban_id={douban_id}
            query={cellSearchQuery.trim() !== title ? cellSearchQuery.trim() : ''}
            type={type}
          />
        </div>
      );
    } else {
      const searchItem = item as SearchResult;
      return (
        <div 
          style={{ 
            ...style, 
            padding: '8px',
            contain: 'layout style', // CSS containment 优化
            backfaceVisibility: 'hidden', // 减少重绘
          }}
        >
          <VideoCard
            id={searchItem.id}
            title={searchItem.title}
            poster={searchItem.poster}
            episodes={searchItem.episodes.length}
            source={searchItem.source}
            source_name={searchItem.source_name}
            douban_id={searchItem.douban_id}
            query={cellSearchQuery.trim() !== searchItem.title ? cellSearchQuery.trim() : ''}
            year={searchItem.year}
            from='search'
            type={searchItem.episodes.length > 1 ? 'tv' : 'movie'}
          />
        </div>
      );
    }
  }, []);

  // 计算网格高度
  const gridHeight = Math.min(
    typeof window !== 'undefined' ? window.innerHeight - 200 : 600,
    800
  );

  // 将所有 hooks 移到组件顶层
  const memoizedCellProps = useMemo(() => ({
    displayData,
    viewMode,
    searchQuery,
    columnCount,
    displayItemCount,
    groupStatsRef,
    getGroupRef,
    computeGroupStats,
  }), [displayData, viewMode, searchQuery, columnCount, displayItemCount, groupStatsRef, getGroupRef, computeGroupStats]);

  const memoizedStyle = useMemo(() => ({
    overflowX: 'hidden' as const,
    overflowY: 'auto' as const,
    isolation: 'auto' as const,
    transition: 'none', // 禁用过渡动画减少闪烁
  }), []);

  const memoizedOnCellsRendered = useCallback(({ rowStopIndex }: any) => {
    const visibleStopIndex = rowStopIndex;
    
    if (visibleStopIndex >= rowCount - LOAD_MORE_THRESHOLD && hasNextPage && !isLoadingMore) {
      // 添加防抖机制
      setTimeout(() => {
        if (!isLoadingMore && hasNextPage) {
          loadMoreItems();
        }
      }, 100);
    }
  }, [rowCount, hasNextPage, isLoadingMore, loadMoreItems]);

  return (
    <div 
      ref={containerRef} 
      className='w-full'
      style={{
        contain: 'layout style paint', // CSS containment 优化
        willChange: 'auto' // 优化GPU加速
      }}
    >
      {totalItemCount === 0 ? (
        <div className='flex justify-center items-center h-40'>
          {isLoading ? (
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
          ) : (
            <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
              未找到相关结果
            </div>
          )}
        </div>
      ) : containerWidth <= 100 ? (
        <div className='flex justify-center items-center h-40'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
          <span className='ml-2 text-sm text-gray-500'>
            初始化虚拟滑动... ({Math.round(containerWidth)}px)
          </span>
        </div>
      ) : (
        <Grid
          key={`search-grid-${containerWidth}-${columnCount}-${viewMode}`}
          cellComponent={CellComponent}
          cellProps={memoizedCellProps}
          columnCount={columnCount}
          columnWidth={itemWidth + 16}
          defaultHeight={gridHeight}
          defaultWidth={containerWidth}
          rowCount={rowCount}
          rowHeight={itemHeight + 16}
          overscanCount={2}
          style={memoizedStyle}
          onCellsRendered={memoizedOnCellsRendered}
        />
      )}
      
      {/* 加载更多指示器 */}
      {containerWidth > 100 && isLoadingMore && (
        <div className='flex justify-center items-center py-4'>
          <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-green-500'></div>
          <span className='ml-2 text-sm text-gray-500 dark:text-gray-400'>
            加载更多...
          </span>
        </div>
      )}
      
      {/* 已加载完所有内容的提示 */}
      {containerWidth > 100 && !hasNextPage && displayItemCount > INITIAL_BATCH_SIZE && (
        <div className='text-center py-4 text-sm text-gray-500 dark:text-gray-400'>
          已显示全部 {displayItemCount} 个结果
        </div>
      )}
    </div>
  );
};

export default VirtualSearchGrid;