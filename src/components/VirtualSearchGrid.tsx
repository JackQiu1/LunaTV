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
  allResults: SearchResult[];
  filteredResults: SearchResult[];
  aggregatedResults: [string, SearchResult[]][];
  filteredAggResults: [string, SearchResult[]][];
  
  // 视图模式
  viewMode: 'agg' | 'all';
  
  // 搜索相关
  searchQuery: string;
  isLoading: boolean;
  
  // VideoCard相关props
  groupRefs: React.MutableRefObject<Map<string, React.RefObject<any>>>;
  groupStatsRef: React.MutableRefObject<Map<string, any>>;
  getGroupRef: (key: string) => React.RefObject<any>;
  computeGroupStats: (group: SearchResult[]) => any;
}

// 渐进式加载配置
const INITIAL_BATCH_SIZE = 12;
const LOAD_MORE_BATCH_SIZE = 8;
const LOAD_MORE_THRESHOLD = 5; // 距离底部还有5行时开始加载

export const VirtualSearchGrid: React.FC<VirtualSearchGridProps> = ({
  allResults,
  filteredResults,
  aggregatedResults,
  filteredAggResults,
  viewMode,
  searchQuery,
  isLoading,
  groupRefs,
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

  // 网格行数计算 - 动态但稳定的策略
  const rowCount = useMemo(() => {
    // 基于当前数据量计算，但添加一些缓冲行避免频繁变化
    const actualRows = Math.ceil(displayItemCount / columnCount);
    const bufferRows = Math.ceil(30 / columnCount); // 添加缓冲行
    return Math.max(1, actualRows + bufferRows);
  }, [displayItemCount, columnCount]);

  // 渲染单个网格项 - 使用稳定的ref数据
  const CellComponent = useCallback(({ 
    columnIndex, 
    rowIndex, 
    style,
    getCellData,
  }: any) => {
    // 从ref获取最新数据
    const { 
      displayData, 
      viewMode, 
      searchQuery, 
      columnCount, 
      displayItemCount,
      groupStatsRef,
      getGroupRef,
      computeGroupStats 
    } = getCellData();
    
    const index = rowIndex * columnCount + columnIndex;
    
    // 如果超出显示范围，返回空
    if (index >= displayItemCount) {
      return <div style={style} />;
    }

    const item = displayData[index];
    
    if (!item) {
      return <div style={style} />;
    }

    // 根据视图模式渲染不同内容
    if (viewMode === 'agg') {
      const [mapKey, group] = item as [string, SearchResult[]];
      const title = group[0]?.title || '';
      const poster = group[0]?.poster || '';
      const year = group[0]?.year || 'unknown';
      const { episodes, source_names, douban_id } = computeGroupStats(group);
      const type = episodes === 1 ? 'movie' : 'tv';

      // 如果该聚合第一次出现，写入初始统计
      if (!groupStatsRef.current.has(mapKey)) {
        groupStatsRef.current.set(mapKey, { episodes, source_names, douban_id });
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
            ref={getGroupRef(mapKey)}
            from='search'
            isAggregate={true}
            title={title}
            poster={poster}
            year={year}
            episodes={episodes}
            source_names={source_names}
            douban_id={douban_id}
            query={searchQuery.trim() !== title ? searchQuery.trim() : ''}
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
            query={searchQuery.trim() !== searchItem.title ? searchQuery.trim() : ''}
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

  // 使用 ref 传递动态数据，让 cellProps 完全稳定
  const cellDataRef = useRef({
    displayData,
    viewMode,
    searchQuery,
    columnCount,
    displayItemCount,
    groupStatsRef,
    getGroupRef,
    computeGroupStats,
  });

  // 更新 ref 数据但不触发重新渲染
  useEffect(() => {
    cellDataRef.current = {
      displayData,
      viewMode,
      searchQuery,
      columnCount,
      displayItemCount,
      groupStatsRef,
      getGroupRef,
      computeGroupStats,
    };
  });

  // 完全稳定的 cellProps - 永不变化
  const stableCellProps = useMemo(() => ({
    getCellData: () => cellDataRef.current,
  }), []); // 空依赖，永远稳定

  const memoizedStyle = useMemo(() => ({
    overflowX: 'hidden' as const,
    overflowY: 'auto' as const,
    isolation: 'auto' as const,
    transition: 'none',
    // 关键：避免 GPU 层创建导致的闪烁
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden' as const,
    // 强制使用硬件加速，但避免创建新的层叠上下文
    willChange: 'scroll-position',
  }), []);

  // 防抖的加载更多回调
  const debounceRef = useRef<NodeJS.Timeout>();
  const memoizedOnCellsRendered = useCallback(({ rowStopIndex }: any) => {
    // 清除之前的防抖
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // 计算实际数据的行数
    const actualRowCount = Math.ceil(displayItemCount / columnCount);
    
    // 判断是否接近底部，需要加载更多
    if (rowStopIndex >= actualRowCount - LOAD_MORE_THRESHOLD && hasNextPage && !isLoadingMore) {
      // 使用防抖避免频繁触发
      debounceRef.current = setTimeout(() => {
        if (!isLoadingMore && hasNextPage) {
          loadMoreItems();
        }
      }, 150);
    }
  }, [columnCount, displayItemCount, hasNextPage, isLoadingMore, loadMoreItems]);

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
          key={`search-grid-${Math.floor(containerWidth / 100)}-${columnCount}`}
          cellComponent={CellComponent}
          cellProps={stableCellProps}
          columnCount={columnCount}
          columnWidth={itemWidth + 16}
          defaultHeight={gridHeight}
          defaultWidth={containerWidth}
          rowCount={rowCount}
          rowHeight={itemHeight + 16}
          overscanCount={3}
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